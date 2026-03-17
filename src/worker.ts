import { buildPublicSnapshots, type PublicSnapshots } from "./pipeline/build-public-snapshots";
import { publishSnapshotSet, type R2BucketLike } from "./publish/publish-to-r2";

export type WorkerEnv = {
  SNAPSHOTS_BUCKET: R2BucketLike;
};

type WorkerDeps = {
  buildPublicSnapshots?: () => Promise<PublicSnapshots>;
};

export function createWorker(deps: WorkerDeps = {}) {
  const runBuild = deps.buildPublicSnapshots || (() => buildPublicSnapshots());

  return {
    async scheduled(_controller: unknown, env: WorkerEnv, _ctx: unknown): Promise<void> {
      const snapshots = await runBuild();

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
