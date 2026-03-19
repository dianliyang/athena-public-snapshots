import { buildPublicSnapshots, type PublicSnapshots } from "./pipeline/build-public-snapshots";
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
      const snapshots = deps.buildPublicSnapshots
        ? await deps.buildPublicSnapshots()
        : await buildPublicSnapshots({ includeCourses: false }, {
            localeBucket: env.SNAPSHOTS_BUCKET,
            translationApiKey: env.GOOGLE_TRANSLATE_API_KEY,
          });

      if (snapshots.courses) {
        await publishSnapshotSet(env.SNAPSHOTS_BUCKET, {
          baseKey: "courses",
          manifest: snapshots.courses.manifest,
          browse: snapshots.courses.browse,
          detail: snapshots.courses.detail,
        });
      }

      if (snapshots.workouts) {
        await publishSnapshotSet(env.SNAPSHOTS_BUCKET, {
          baseKey: "workouts",
          manifest: snapshots.workouts.manifest,
          browse: snapshots.workouts.browse,
          detail: snapshots.workouts.detail,
        });
      }
    },
  };
}

export default createWorker();
