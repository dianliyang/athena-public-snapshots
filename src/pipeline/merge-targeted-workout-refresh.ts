import type {
  ManifestSnapshot,
  WorkoutDetailRecord,
  WorkoutsDetailSnapshot,
} from "../schema";

const TARGET_PROVIDERS: Record<string, string[]> = {
  "cau-sport": ["CAU Kiel Sportzentrum"],
  "urban-apes": ["Urban Apes"],
  "ricks-club": ["Ricks Club"],
  "haw-kiel-sport": ["HAW Kiel Hochschulsport"],
};

export function mergeTargetedWorkoutRefresh(
  target: string | undefined,
  publishedWorkouts: WorkoutDetailRecord[],
  refreshedDetail: WorkoutsDetailSnapshot,
  manifest: ManifestSnapshot,
): {
  manifest: ManifestSnapshot;
  detail: WorkoutsDetailSnapshot;
} {
  const providers = target ? TARGET_PROVIDERS[target] : undefined;
  if (!providers || providers.length === 0) {
    return { manifest, detail: refreshedDetail };
  }

  const retainedPublished = publishedWorkouts.filter(
    (workout) => !providers.includes(workout.provider),
  );
  const mergedDetail: WorkoutsDetailSnapshot = {};

  for (const workout of retainedPublished) {
    mergedDetail[workout.id] = workout;
  }

  for (const workout of Object.values(refreshedDetail)) {
    mergedDetail[workout.id] = workout;
  }

  return {
    manifest: {
      ...manifest,
      itemCount: Object.keys(mergedDetail).length,
    },
    detail: mergedDetail,
  };
}
