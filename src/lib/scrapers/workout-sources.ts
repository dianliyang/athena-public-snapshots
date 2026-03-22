import { CAUSport } from "./cau-sport";
import { HAWKielSport } from "./haw-kiel-sport";
import { RicksClub } from "./ricks-club";
import { UrbanApes } from "./urban-apes";
import type { CauCacheState } from "./cau-sport";
import type { WorkoutCourse } from "./workout-types";

export type WorkoutSourceBatch = {
  source: string;
  workouts: WorkoutCourse[];
  pageUrl?: string;
};

export type WorkoutSourceRetrievalResult = {
  batches: WorkoutSourceBatch[];
  meta?: Record<string, unknown>;
};

const ACTIVE_WORKOUT_SOURCES: Array<"cau-sport" | "urban-apes" | "ricks-club" | "haw-kiel-sport"> = ["cau-sport", "urban-apes", "ricks-club", "haw-kiel-sport"];

export async function retrieveWorkoutSourceBatches({
  semester,
  category,
  source,
  sources,
  cacheState,
  cauDetailPageBudget,
}: {
  semester?: string;
  category?: string;
  source?: "cau-sport" | "urban-apes" | "ricks-club" | "haw-kiel-sport";
  sources?: Array<"cau-sport" | "urban-apes" | "ricks-club" | "haw-kiel-sport">;
  cacheState?: {
    cau?: CauCacheState;
  };
  cauDetailPageBudget?: number;
}): Promise<WorkoutSourceRetrievalResult> {
  const requestedSources = sources?.length
    ? Array.from(new Set(sources))
    : source
      ? [source]
      : ACTIVE_WORKOUT_SOURCES;
  const selectedSources = requestedSources.filter(
    (requested): requested is "cau-sport" | "urban-apes" | "ricks-club" | "haw-kiel-sport" => ACTIVE_WORKOUT_SOURCES.includes(requested as "cau-sport" | "urban-apes" | "ricks-club" | "haw-kiel-sport"),
  );

  const batches: WorkoutSourceBatch[] = [];
  let meta: Record<string, unknown> | undefined;

  if (selectedSources.includes("cau-sport")) {
    const cauSport = new CAUSport();
    if (semester) cauSport.semester = semester;
    const result = await cauSport.retrieveWorkoutBatch({
      categoryName: category,
      cacheState: cacheState?.cau,
      detailPageBudget: cauDetailPageBudget,
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

  if (selectedSources.includes("haw-kiel-sport")) {
    const hawKielSport = new HAWKielSport();
    batches.push({
      source: "HAW Kiel Hochschulsport",
      workouts: await hawKielSport.retrieveWorkouts(category),
      pageUrl: "https://haw-kiel.venuzle.com/search/events?v=table",
    });
  }

  return { batches, meta };
}
