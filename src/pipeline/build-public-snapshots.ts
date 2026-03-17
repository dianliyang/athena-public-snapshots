import { MIT } from "../lib/scrapers/mit";
import { Stanford } from "../lib/scrapers/stanford";
import { CMU } from "../lib/scrapers/cmu";
import { UCB } from "../lib/scrapers/ucb";
import { retrieveWorkoutSourceBatches } from "../lib/scrapers/workout-sources";
import { buildCoursesSnapshot } from "../build/build-courses-snapshot";
import { buildWorkoutsSnapshot } from "../build/build-workouts-snapshot";
import type { R2BucketLike } from "../publish/publish-to-r2";

type CourseSnapshotSet = ReturnType<typeof buildCoursesSnapshot>;
type WorkoutSnapshotSet = ReturnType<typeof buildWorkoutsSnapshot>;
type LocaleEntry = Record<string, string>;
type LocaleMap = Record<string, LocaleEntry>;
type LocaleBucketLike = R2BucketLike & {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};
type TranslateTargetLocale = "en" | "ja" | "ko" | "zh-CN";
type TranslateText = (text: string, target: TranslateTargetLocale) => Promise<string>;
type TranslateFetch = typeof fetch;

function buildWorkoutTitleLocaleKey(version: string): string {
  return `workouts/locales/title/${version}.json`;
}

function buildWorkoutCategoryLocaleKey(version: string): string {
  return `workouts/locales/category/${version}.json`;
}

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
  localeBucket?: LocaleBucketLike;
  warn?: (message: string) => void;
  translateText?: TranslateText;
  translationApiKey?: string;
  fetchImpl?: TranslateFetch;
};

const ALL_WORKOUT_SOURCES: Array<"cau-sport" | "urban-apes" | "ricks-club"> = ["cau-sport", "urban-apes", "ricks-club"];

function normalizeWorkoutForSnapshot(workout: any) {
  return {
    ...workout,
    id: workout.id ?? `${workout.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${workout.courseCode}`,
    title: workout.title,
    provider: workout.provider ?? workout.source,
    weekday: workout.weekday ?? workout.dayOfWeek,
    timeLabel: workout.timeLabel ?? (
      workout.startTime && workout.endTime
        ? `${workout.startTime}-${workout.endTime}`
        : workout.startTime || workout.endTime || undefined
    ),
  };
}

function buildVersion(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildGoogleTranslateText(
  apiKey: string,
  fetchImpl: TranslateFetch = fetch,
): TranslateText {
  return async (text, target) => {
    const response = await fetchImpl(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          q: text,
          source: "de",
          target,
          format: "text",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Google Translate request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const translated = payload.data?.translations?.[0]?.translatedText?.trim();

    if (!translated) {
      throw new Error(`Google Translate returned no translation for target ${target}`);
    }

    return translated;
  };
}

function buildLocaleTemplate(source: string, existingMap: LocaleMap): LocaleEntry {
  const sample = Object.values(existingMap)[0];
  const locales = sample ? Object.keys(sample) : ["en", "de", "ja", "ko", "zh-CN"];

  return Object.fromEntries(
    locales.map((locale) => [locale, locale === "de" ? source : ""]),
  );
}

async function fillTranslatedLocales(
  entry: LocaleEntry,
  source: string,
  translateText?: TranslateText,
): Promise<LocaleEntry> {
  if (!translateText) return entry;

  const targets = (Object.keys(entry) as TranslateTargetLocale[])
    .filter((locale) => locale !== "de");

  const translations = await Promise.all(
    targets.map(async (target) => [target, await translateText(source, target)] as const),
  );

  return {
    ...entry,
    ...Object.fromEntries(translations),
  };
}

async function readLocaleMap(bucket: LocaleBucketLike, key: string): Promise<LocaleMap> {
  const object = await bucket.get?.(key);
  if (!object) return {};

  const text = await object.text();
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" ? parsed as LocaleMap : {};
}

async function appendMissingLocaleEntries(
  map: LocaleMap,
  values: string[],
  translateText?: TranslateText,
): Promise<{ map: LocaleMap; changed: boolean }> {
  const nextMap: LocaleMap = { ...map };
  let changed = false;

  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || nextMap[normalized]) continue;
    nextMap[normalized] = await fillTranslatedLocales(
      buildLocaleTemplate(normalized, map),
      normalized,
      translateText,
    );
    changed = true;
  }

  return { map: nextMap, changed };
}

async function syncWorkoutLocaleMaps(
  workouts: any[],
  bucket: LocaleBucketLike,
  version: string,
  translateText?: TranslateText,
): Promise<void> {
  const titleKey = buildWorkoutTitleLocaleKey(version);
  const categoryKey = buildWorkoutCategoryLocaleKey(version);
  const titles = Array.from(new Set(workouts.map((workout) => String(workout.title || "").trim()).filter(Boolean)));
  const categories = Array.from(new Set(workouts.map((workout) => String(workout.category || "").trim()).filter(Boolean)));

  const [titleMap, categoryMap] = await Promise.all([
    readLocaleMap(bucket, titleKey),
    readLocaleMap(bucket, categoryKey),
  ]);

  const [nextTitles, nextCategories] = await Promise.all([
    appendMissingLocaleEntries(titleMap, titles, translateText),
    appendMissingLocaleEntries(categoryMap, categories, translateText),
  ]);

  if (nextTitles.changed) {
    await bucket.put(titleKey, JSON.stringify(nextTitles.map, null, 2));
  }

  if (nextCategories.changed) {
    await bucket.put(categoryKey, JSON.stringify(nextCategories.map, null, 2));
  }
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

  return workouts.map(normalizeWorkoutForSnapshot);
}

export async function buildPublicSnapshots(
  options: BuildPublicSnapshotsOptions = {},
  deps: BuildPublicSnapshotsDeps = {},
): Promise<PublicSnapshots> {
  const version = options.version || buildVersion();
  const target = options.target?.toLowerCase();
  const retrieveCourses = deps.retrieveCourses || defaultRetrieveCourses;
  const retrieveWorkouts = deps.retrieveWorkouts || defaultRetrieveWorkouts;
  const warn = deps.warn || ((message: string) => console.warn(message));
  const translateText = deps.translateText || (
    deps.translationApiKey
      ? buildGoogleTranslateText(deps.translationApiKey, deps.fetchImpl)
      : undefined
  );

  const [coursesInput, workoutsInput] = await Promise.all([
    retrieveCourses(target),
    retrieveWorkouts(target, options.workoutSemester),
  ]);

  if (workoutsInput.length > 0 && deps.localeBucket?.put && deps.localeBucket?.get) {
    try {
      await syncWorkoutLocaleMaps(workoutsInput, deps.localeBucket, version, translateText);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn(`Failed to sync workout locale maps: ${detail}`);
    }
  }

  const result: PublicSnapshots = { version };

  if (coursesInput.length > 0) {
    result.courses = buildCoursesSnapshot(coursesInput, version);
  }

  if (workoutsInput.length > 0) {
    result.workouts = buildWorkoutsSnapshot(workoutsInput.map(normalizeWorkoutForSnapshot), version);
    result.workouts.manifest.titleLocaleKey = buildWorkoutTitleLocaleKey(version);
    result.workouts.manifest.categoryLocaleKey = buildWorkoutCategoryLocaleKey(version);
  }

  return result;
}
