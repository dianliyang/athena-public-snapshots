import { buildPublicSnapshots } from "./build-public-snapshots";
import type { RawWorkoutsPayload } from "./retrieve-raw-workouts";
import { publishSnapshotSet, type R2BucketLike } from "../publish/publish-to-r2";

type BucketWithGet = R2BucketLike & {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};

export async function publishWorkoutsFromRawPayload(
  rawWorkouts: RawWorkoutsPayload,
  bucket: BucketWithGet,
  options: {
    translationApiKey?: string;
  } = {},
): Promise<void> {
  const snapshots = await buildPublicSnapshots(
    {
      version: rawWorkouts.version,
    },
    {
      localeBucket: bucket,
      translationApiKey: options.translationApiKey,
      retrieveWorkouts: async () => rawWorkouts.workouts,
    },
  );

  if (snapshots.workouts) {
    console.log(`[publish] Writing workouts detail snapshot to ${snapshots.workouts.manifest.detailKey}`);
    console.log("[publish] Writing workouts manifest to workouts/manifest.json");
    console.log(`[publish] Manifest title locale key: ${snapshots.workouts.manifest.titleLocaleKey}`);
    console.log(`[publish] Manifest category locale key: ${snapshots.workouts.manifest.categoryLocaleKey}`);
    console.log(`[publish] Manifest metadata locale key: ${snapshots.workouts.manifest.metadataLocaleKey}`);
    console.log(`[publish] Manifest wikipedia locale key: ${snapshots.workouts.manifest.wikipediaLocaleKey}`);

    await publishSnapshotSet(bucket, {
      baseKey: "workouts",
      manifest: snapshots.workouts.manifest,
      detail: snapshots.workouts.detail,
    });
  }
}
