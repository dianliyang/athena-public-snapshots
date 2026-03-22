import { retrieveWorkoutSourceBatches } from "../lib/scrapers/workout-sources";
import { buildCurrentWorkoutSemester } from "../lib/scrapers/utils/semester";
import type { R2BucketLike } from "../publish/publish-to-r2";

type CacheBucketLike = R2BucketLike & {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};

export const RAW_WORKOUTS_LATEST_KEY = "internal/raw/workouts/latest.json";
const ALL_WORKOUT_SOURCES: Array<"cau-sport" | "urban-apes" | "ricks-club" | "haw-kiel-sport"> = ["cau-sport", "urban-apes", "ricks-club", "haw-kiel-sport"];

export type RawWorkoutsPayload = {
  version: string;
  generatedAt: string;
  semester: string;
  target?: string;
  workouts: any[];
  meta?: Record<string, unknown>;
};

function buildVersion(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export async function retrieveRawWorkouts(
  {
    target,
    semester = buildCurrentWorkoutSemester(),
    version = buildVersion(),
  }: {
    target?: string;
    semester?: string;
    version?: string;
  } = {},
  deps: {
    cacheBucket?: CacheBucketLike;
  } = {},
): Promise<RawWorkoutsPayload> {
  const normalizedTarget = target?.toLowerCase();
  const workoutSources = normalizedTarget
    ? ALL_WORKOUT_SOURCES.filter((source) => source === normalizedTarget)
    : ALL_WORKOUT_SOURCES;

  if (workoutSources.length === 0) {
    return {
      version,
      generatedAt: new Date().toISOString(),
      semester,
      ...(normalizedTarget ? { target: normalizedTarget } : {}),
      workouts: [],
    };
  }

  const retrieval = await retrieveWorkoutSourceBatches({
    semester,
    sources: workoutSources,
  });

  return {
    version,
    generatedAt: new Date().toISOString(),
    semester,
    ...(normalizedTarget ? { target: normalizedTarget } : {}),
    workouts: retrieval.batches.flatMap((batch) => batch.workouts),
    ...(retrieval.meta ? { meta: retrieval.meta } : {}),
  };
}
