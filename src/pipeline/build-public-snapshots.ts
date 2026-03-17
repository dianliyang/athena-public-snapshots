import { MIT } from "../lib/scrapers/mit";
import { Stanford } from "../lib/scrapers/stanford";
import { CMU } from "../lib/scrapers/cmu";
import { UCB } from "../lib/scrapers/ucb";
import { retrieveWorkoutSourceBatches } from "../lib/scrapers/workout-sources";
import { buildCoursesSnapshot } from "../build/build-courses-snapshot";
import { buildWorkoutsSnapshot } from "../build/build-workouts-snapshot";

type CourseSnapshotSet = ReturnType<typeof buildCoursesSnapshot>;
type WorkoutSnapshotSet = ReturnType<typeof buildWorkoutsSnapshot>;

export type PublicSnapshots = {
  version: string;
  courses?: CourseSnapshotSet;
  workouts?: WorkoutSnapshotSet;
};

export type BuildPublicSnapshotsOptions = {
  version?: string;
  target?: string;
  workoutSemester?: string;
};

export type BuildPublicSnapshotsDeps = {
  retrieveCourses?: (target?: string) => Promise<any[]>;
  retrieveWorkouts?: (target?: string, semester?: string) => Promise<any[]>;
};

const ALL_WORKOUT_SOURCES: Array<"cau-sport" | "urban-apes"> = ["cau-sport", "urban-apes"];

function buildVersion(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function defaultRetrieveCourses(target?: string): Promise<any[]> {
  const allCourseScrapers = [new MIT(), new Stanford(), new CMU(), new UCB()];
  const normalizedTarget = target?.toLowerCase();
  const courseScrapers = normalizedTarget
    ? allCourseScrapers.filter((scraper) => scraper.name.toLowerCase() === normalizedTarget)
    : allCourseScrapers;

  let allCourses: any[] = [];

  for (const scraper of courseScrapers) {
    try {
      const items = await scraper.retrieve();
      allCourses = allCourses.concat(items.map((item: any) => ({
        id: `${item.university}-${item.courseCode}`,
        title: item.title,
        courseCode: item.courseCode,
        university: item.university,
        description: item.description,
        credit: item.credit,
        level: item.level,
        department: item.department,
        subdomain: item.subdomain,
        category: item.category,
        latestSemester: item.latestSemester,
        url: item.url,
        resources: item.resources,
        instructors: item.instructors,
      })));
    } catch (error) {
      console.error(`Failed to scrape ${scraper.name}:`, error);
    }
  }

  return allCourses;
}

async function defaultRetrieveWorkouts(target?: string, semester = "wi25"): Promise<any[]> {
  const normalizedTarget = target?.toLowerCase();
  const workoutSources = normalizedTarget
    ? ALL_WORKOUT_SOURCES.filter((source) => source === normalizedTarget)
    : ALL_WORKOUT_SOURCES;

  if (workoutSources.length === 0) return [];

  const retrieval = await retrieveWorkoutSourceBatches({ semester, sources: workoutSources });
  const workouts = retrieval.batches.flatMap((batch) => batch.workouts);

  return workouts.map((workout: any) => ({
    ...workout,
    id: `${workout.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${workout.courseCode}`,
    title: workout.title,
    provider: workout.source,
  }));
}

export async function buildPublicSnapshots(
  options: BuildPublicSnapshotsOptions = {},
  deps: BuildPublicSnapshotsDeps = {},
): Promise<PublicSnapshots> {
  const version = options.version || buildVersion();
  const target = options.target?.toLowerCase();
  const retrieveCourses = deps.retrieveCourses || defaultRetrieveCourses;
  const retrieveWorkouts = deps.retrieveWorkouts || defaultRetrieveWorkouts;

  const [coursesInput, workoutsInput] = await Promise.all([
    retrieveCourses(target),
    retrieveWorkouts(target, options.workoutSemester),
  ]);

  const result: PublicSnapshots = { version };

  if (coursesInput.length > 0) {
    result.courses = buildCoursesSnapshot(coursesInput, version);
  }

  if (workoutsInput.length > 0) {
    result.workouts = buildWorkoutsSnapshot(workoutsInput, version);
  }

  return result;
}
