import { buildPublicSnapshots, type PublicSnapshots } from "./pipeline/build-public-snapshots";
import { publishWorkoutsFromRawPayload } from "./pipeline/publish-workouts-from-raw";
import { RAW_WORKOUTS_LATEST_KEY, type RawWorkoutsPayload } from "./pipeline/retrieve-raw-workouts";
import { publishSnapshotSet, type R2BucketLike } from "./publish/publish-to-r2";

export type WorkerEnv = {
  SNAPSHOTS_BUCKET: R2BucketLike & {
    get?(key: string): Promise<{ text(): Promise<string> } | null>;
  };
  GOOGLE_TRANSLATE_API_KEY?: string;
};

type WorkerDeps = {
  buildPublicSnapshots?: () => Promise<PublicSnapshots>;
};

async function readRawWorkoutsPayload(
  bucket: WorkerEnv["SNAPSHOTS_BUCKET"],
): Promise<RawWorkoutsPayload> {
  const object = await bucket.get?.(RAW_WORKOUTS_LATEST_KEY);
  if (!object) {
    throw new Error(`Missing raw workouts payload at ${RAW_WORKOUTS_LATEST_KEY}`);
  }

  return JSON.parse(await object.text()) as RawWorkoutsPayload;
}

export function createWorker(deps: WorkerDeps = {}) {
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      const key = url.pathname.replace(/^\/+/, "");

      if (request.method !== "GET" || !key) {
        return new Response("Not found", { status: 404 });
      }

      const object = await env.SNAPSHOTS_BUCKET.get?.(key);
      if (!object) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(await object.text(), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    },
    async scheduled(_controller: unknown, env: WorkerEnv, _ctx: unknown): Promise<void> {
      if (deps.buildPublicSnapshots) {
        const snapshots = await deps.buildPublicSnapshots();
        if (snapshots.workouts) {
          await publishSnapshotSet(env.SNAPSHOTS_BUCKET, {
            baseKey: "workouts",
            manifest: snapshots.workouts.manifest,
            detail: snapshots.workouts.detail,
          });
        }
        return;
      }

      const rawWorkouts = await readRawWorkoutsPayload(env.SNAPSHOTS_BUCKET);
      await publishWorkoutsFromRawPayload(rawWorkouts, env.SNAPSHOTS_BUCKET, {
        translationApiKey: env.GOOGLE_TRANSLATE_API_KEY,
      });
    },
  };
}

export default createWorker();
