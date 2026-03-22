import {
  isManifestSnapshot,
  isWorkoutsDetailSnapshot,
  type ManifestSnapshot,
  type WorkoutDetailRecord,
} from "../schema";

type BucketWithGet = {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};

const WORKOUTS_MANIFEST_KEY = "workouts/manifest.json";

export async function retrievePublishedWorkoutSnapshot(
  bucket: BucketWithGet,
): Promise<{ manifest: ManifestSnapshot; workouts: WorkoutDetailRecord[] }> {
  const manifestObject = await bucket.get?.(WORKOUTS_MANIFEST_KEY);
  if (!manifestObject) {
    throw new Error(`Missing workouts manifest at ${WORKOUTS_MANIFEST_KEY}`);
  }

  const manifestPayload = JSON.parse(await manifestObject.text()) as unknown;
  if (!isManifestSnapshot(manifestPayload)) {
    throw new Error(`Invalid workouts manifest at ${WORKOUTS_MANIFEST_KEY}`);
  }

  const detailObject = await bucket.get?.(manifestPayload.detailKey);
  if (!detailObject) {
    throw new Error(
      `Missing workouts detail snapshot at ${manifestPayload.detailKey}`,
    );
  }

  const detailPayload = JSON.parse(await detailObject.text()) as unknown;
  if (!isWorkoutsDetailSnapshot(detailPayload)) {
    throw new Error(
      `Invalid workouts detail snapshot at ${manifestPayload.detailKey}`,
    );
  }

  return {
    manifest: manifestPayload,
    workouts: Object.values(detailPayload),
  };
}

export async function retrievePublishedWorkoutDetails(
  bucket: BucketWithGet,
): Promise<WorkoutDetailRecord[]> {
  const snapshot = await retrievePublishedWorkoutSnapshot(bucket);
  return snapshot.workouts;
}
