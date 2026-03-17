import { CAUSport } from "./cau-sport";
import { RicksClub } from "./ricks-club";
import { UrbanApes } from "./urban-apes";
import type { CauCacheState, WorkoutCourse } from "./cau-sport";

export type WorkoutSourceBatch = {
  source: string;
  workouts: WorkoutCourse[];
  pageUrl?: string;
};

export type WorkoutSourceRetrievalResult = {
  batches: WorkoutSourceBatch[];
  meta?: Record<string, unknown>;
};

export async function retrieveWorkoutSourceBatches({
  semester,
  category,
  source,
  sources,
  cacheState,
}: {
  semester?: string;
  category?: string;
  source?: "cau-sport" | "urban-apes" | "ricks-club";
  sources?: Array<"cau-sport" | "urban-apes" | "ricks-club">;
  cacheState?: {
    cau?: CauCacheState;
  };
}): Promise<WorkoutSourceRetrievalResult> {
  const selectedSources = sources?.length
    ? Array.from(new Set(sources))
    : source
      ? [source]
      : ["cau-sport"];

  const batches: WorkoutSourceBatch[] = [];
  let meta: Record<string, unknown> | undefined;

  if (selectedSources.includes("cau-sport")) {
    const cauSport = new CAUSport();
    if (semester) cauSport.semester = semester;
    const result = await cauSport.retrieveWorkoutBatch({
      categoryName: category,
      cacheState: cacheState?.cau,
    });
    batches.push(
      ...result.batches.map((batch) => ({
        source: "CAU Kiel Sportzentrum",
        workouts: batch.workouts,
        pageUrl: batch.pageUrl,
      })),
    );
    if (result.meta) {
      meta = { ...(meta || {}), ...result.meta };
    }
  }

  if (selectedSources.includes("urban-apes")) {
    const urbanApes = new UrbanApes();
    batches.push({
      source: "Urban Apes",
      workouts: await urbanApes.retrieveWorkouts(category),
      pageUrl: "https://www.urbanapes.de/kiel/quick-overview/",
    });
  }

  if (selectedSources.includes("ricks-club")) {
    const ricksClub = new RicksClub();
    batches.push({
      source: "Ricks Club",
      workouts: await ricksClub.retrieveWorkouts(category),
      pageUrl: "https://www.ricksclub.de/",
    });
  }

  return { batches, meta };
}
