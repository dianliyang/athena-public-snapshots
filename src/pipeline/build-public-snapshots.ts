import { retrieveRawWorkouts } from "./retrieve-raw-workouts";
import { buildCurrentWorkoutSemester } from "../lib/scrapers/utils/semester";
import { buildWorkoutsSnapshot } from "../build/build-workouts-snapshot";
import type { R2BucketLike } from "../publish/publish-to-r2";
import type { ManifestSnapshot } from "../schema";

type WorkoutSnapshotSet = ReturnType<typeof buildWorkoutsSnapshot>;
type LocaleEntry = Record<string, string>;
type LocaleMap = Record<string, LocaleEntry>;
type DescriptionLocaleEntry = {
  original: string;
} & LocaleEntry;
type WorkoutMetadataLocaleEntry = {
  description?: Record<string, DescriptionLocaleEntry>;
};
type WorkoutMetadataLocaleMap = Record<string, WorkoutMetadataLocaleEntry>;
type LocaleBucketLike = R2BucketLike & {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};
type TranslateTargetLocale = "en" | "ja" | "ko" | "zh-CN";
type TranslateText = (
  text: string,
  target: TranslateTargetLocale,
) => Promise<string>;
type TranslateFetch = typeof fetch;
type WorkoutLocaleSeedKeys = Pick<
  ManifestSnapshot,
  | "titleLocaleKey"
  | "categoryLocaleKey"
  | "metadataLocaleKey"
  | "wikipediaLocaleKey"
>;

function buildWorkoutTitleLocaleKey(version: string): string {
  return `workouts/locales/title/${version}.json`;
}

function buildWorkoutCategoryLocaleKey(version: string): string {
  return `workouts/locales/category/${version}.json`;
}

function buildWorkoutMetadataLocaleKey(version: string): string {
  return `workouts/locales/metadata/${version}.json`;
}

function buildWorkoutWikipediaLocaleKey(version: string): string {
  return `workouts/locales/wikipedia/${version}.json`;
}

export type PublicSnapshots = {
  version: string;
  workouts?: WorkoutSnapshotSet;
};

export type BuildPublicSnapshotsOptions = {
  version?: string;
  target?: string;
  workoutSemester?: string;
  includeWorkouts?: boolean;
};

export type BuildPublicSnapshotsDeps = {
  retrieveWorkouts?: (target?: string, semester?: string) => Promise<any[]>;
  localeBucket?: LocaleBucketLike;
  seedWorkoutLocaleKeys?: Partial<WorkoutLocaleSeedKeys>;
  warn?: (message: string) => void;
  log?: (message: string) => void;
  translateText?: TranslateText;
  translationApiKey?: string;
  fetchImpl?: TranslateFetch;
};

export type SyncWorkoutMetadataLocalesDeps = {
  localeBucket: LocaleBucketLike;
  translateText?: TranslateText;
  translationApiKey?: string;
  fetchImpl?: TranslateFetch;
};

function normalizeWorkoutForSnapshot(workout: any) {
  return {
    ...workout,
    id:
      workout.id ??
      `${workout.source.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${workout.courseCode}`,
    title: workout.title,
    provider: workout.provider ?? workout.source,
    weekday: workout.weekday ?? workout.dayOfWeek,
    timeLabel:
      workout.timeLabel ??
      (workout.startTime && workout.endTime
        ? `${workout.startTime}-${workout.endTime}`
        : workout.startTime || workout.endTime || undefined),
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
      throw new Error(
        `Google Translate request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const translated = payload.data?.translations?.[0]?.translatedText?.trim();

    if (!translated) {
      throw new Error(
        `Google Translate returned no translation for target ${target}`,
      );
    }

    return translated;
  };
}

function buildLocaleTemplate(
  source: string,
  existingMap: LocaleMap,
): LocaleEntry {
  const sample = Object.values(existingMap)[0];
  const locales = sample
    ? Object.keys(sample)
    : ["en", "de", "ja", "ko", "zh-CN"];

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

  const targets = (Object.keys(entry) as TranslateTargetLocale[]).filter(
    (locale) => locale !== "de",
  );

  const translations = await Promise.all(
    targets.map(
      async (target) => [target, await translateText(source, target)] as const,
    ),
  );

  return {
    ...entry,
    ...Object.fromEntries(translations),
  };
}

async function readLocaleMap(
  bucket: LocaleBucketLike,
  key: string,
): Promise<LocaleMap> {
  const object = await bucket.get?.(key);
  if (!object) return {};

  const text = await object.text();
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" ? (parsed as LocaleMap) : {};
}

async function readWorkoutMetadataLocaleMap(
  bucket: LocaleBucketLike,
  key: string,
): Promise<WorkoutMetadataLocaleMap> {
  const object = await bucket.get?.(key);
  if (!object) return {};

  const text = await object.text();
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object"
    ? (parsed as WorkoutMetadataLocaleMap)
    : {};
}

async function readSeededLocaleMap(
  bucket: LocaleBucketLike,
  primaryKey: string,
  fallbackKey?: string,
): Promise<LocaleMap> {
  const object = await bucket.get?.(primaryKey);
  if (object) return readLocaleMap(bucket, primaryKey);
  if (fallbackKey && fallbackKey !== primaryKey)
    return readLocaleMap(bucket, fallbackKey);
  return {};
}

async function readSeededWorkoutMetadataLocaleMap(
  bucket: LocaleBucketLike,
  primaryKey: string,
  fallbackKey?: string,
): Promise<WorkoutMetadataLocaleMap> {
  const object = await bucket.get?.(primaryKey);
  if (object) return readWorkoutMetadataLocaleMap(bucket, primaryKey);
  if (fallbackKey && fallbackKey !== primaryKey)
    return readWorkoutMetadataLocaleMap(bucket, fallbackKey);
  return {};
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

async function appendMissingWikipediaEntries(
  map: LocaleMap,
  workouts: any[],
): Promise<{ map: LocaleMap; changed: boolean }> {
  const nextMap: LocaleMap = { ...map };
  let changed = false;

  for (const workout of workouts) {
    const workoutId = String(workout.id || "").trim();
    if (!workoutId || nextMap[workoutId]) continue;

    const seedTitle = String(workout.title || "").trim();
    nextMap[workoutId] = buildLocaleTemplate(seedTitle, map);
    changed = true;
  }

  return { map: nextMap, changed };
}

function normalizeLocalizedSourceText(value: unknown): string {
  return String(value || "").trim();
}

async function buildDescriptionLocaleEntry(
  source: string,
  existingEntry: DescriptionLocaleEntry | undefined,
  translateText?: TranslateText,
): Promise<{ entry: DescriptionLocaleEntry; changed: boolean }> {
  if (existingEntry?.original === source) {
    return {
      entry: existingEntry,
      changed: false,
    };
  }

  const template = buildLocaleTemplate(source, {});
  const translated = await fillTranslatedLocales(
    template,
    source,
    translateText,
  );

  return {
    entry: {
      original: source,
      ...translated,
    },
    changed: true,
  };
}

async function syncWorkoutMetadataLocaleMap(
  workouts: any[],
  bucket: LocaleBucketLike,
  version: string,
  translateText?: TranslateText,
  seedKey?: string,
): Promise<void> {
  const metadataKey = buildWorkoutMetadataLocaleKey(version);
  const existingObject = await bucket.get?.(metadataKey);
  const existingMap = await readSeededWorkoutMetadataLocaleMap(
    bucket,
    metadataKey,
    seedKey,
  );
  const nextMap: WorkoutMetadataLocaleMap = {};
  let changed = false;

  for (const workout of workouts) {
    const workoutId = String(workout.id || "").trim();
    if (!workoutId) continue;

    const description = workout.description;
    if (!description || typeof description !== "object") continue;

    const nextDescriptionEntries: Record<string, DescriptionLocaleEntry> = {};
    const existingDescriptionEntries =
      existingMap[workoutId]?.description || {};

    for (const [field, rawValue] of Object.entries(description)) {
      const source = normalizeLocalizedSourceText(rawValue);
      if (!source) continue;

      const existingEntry = existingDescriptionEntries[field];
      const { entry, changed: entryChanged } =
        await buildDescriptionLocaleEntry(source, existingEntry, translateText);
      nextDescriptionEntries[field] = entry;
      changed = changed || entryChanged;
    }

    if (Object.keys(nextDescriptionEntries).length === 0) continue;

    nextMap[workoutId] = { description: nextDescriptionEntries };

    const existingWorkoutEntry = existingMap[workoutId];
    if (
      JSON.stringify(existingWorkoutEntry || {}) !==
      JSON.stringify(nextMap[workoutId])
    ) {
      changed = true;
    }
  }

  if (changed || !existingObject) {
    await bucket.put(metadataKey, JSON.stringify(nextMap, null, 2));
  }
}

export async function syncWorkoutMetadataLocales(
  workouts: any[],
  version: string,
  deps: SyncWorkoutMetadataLocalesDeps,
): Promise<string> {
  const translateText =
    deps.translateText ||
    (deps.translationApiKey
      ? buildGoogleTranslateText(deps.translationApiKey, deps.fetchImpl)
      : undefined);

  await syncWorkoutMetadataLocaleMap(
    workouts,
    deps.localeBucket,
    version,
    translateText,
  );
  return buildWorkoutMetadataLocaleKey(version);
}

async function syncWorkoutLocaleMaps(
  workouts: any[],
  bucket: LocaleBucketLike,
  version: string,
  translateText?: TranslateText,
  seedKeys: Partial<WorkoutLocaleSeedKeys> = {},
): Promise<void> {
  const titleKey = buildWorkoutTitleLocaleKey(version);
  const categoryKey = buildWorkoutCategoryLocaleKey(version);
  const wikipediaKey = buildWorkoutWikipediaLocaleKey(version);
  const titles = Array.from(
    new Set(
      workouts
        .map((workout) => String(workout.title || "").trim())
        .filter(Boolean),
    ),
  );
  const categories = Array.from(
    new Set(
      workouts
        .map((workout) => String(workout.category || "").trim())
        .filter(Boolean),
    ),
  );

  const [titleObject, categoryObject, wikipediaObject] = await Promise.all([
    bucket.get?.(titleKey),
    bucket.get?.(categoryKey),
    bucket.get?.(wikipediaKey),
  ]);

  const [titleMap, categoryMap, wikipediaMap] = await Promise.all([
    readSeededLocaleMap(bucket, titleKey, seedKeys.titleLocaleKey),
    readSeededLocaleMap(bucket, categoryKey, seedKeys.categoryLocaleKey),
    readSeededLocaleMap(bucket, wikipediaKey, seedKeys.wikipediaLocaleKey),
  ]);

  const [nextTitles, nextCategories, nextWikipedia] = await Promise.all([
    appendMissingLocaleEntries(titleMap, titles, translateText),
    appendMissingLocaleEntries(categoryMap, categories, translateText),
    appendMissingWikipediaEntries(wikipediaMap, workouts),
  ]);

  if (nextTitles.changed || !titleObject) {
    await bucket.put(titleKey, JSON.stringify(nextTitles.map, null, 2));
  }

  if (nextCategories.changed || !categoryObject) {
    await bucket.put(categoryKey, JSON.stringify(nextCategories.map, null, 2));
  }

  if (nextWikipedia.changed || !wikipediaObject) {
    await bucket.put(wikipediaKey, JSON.stringify(nextWikipedia.map, null, 2));
  }

  await syncWorkoutMetadataLocaleMap(
    workouts,
    bucket,
    version,
    translateText,
    seedKeys.metadataLocaleKey,
  );
}

async function defaultRetrieveWorkouts(
  target?: string,
  semester = buildCurrentWorkoutSemester(),
  bucket?: LocaleBucketLike,
): Promise<any[]> {
  const payload = await retrieveRawWorkouts(
    { target, semester },
    { cacheBucket: bucket },
  );
  return payload.workouts.map(normalizeWorkoutForSnapshot);
}

export async function buildPublicSnapshots(
  options: BuildPublicSnapshotsOptions = {},
  deps: BuildPublicSnapshotsDeps = {},
): Promise<PublicSnapshots> {
  const version = options.version || buildVersion();
  const target = options.target?.toLowerCase();
  const includeWorkouts = options.includeWorkouts ?? true;
  const retrieveWorkouts =
    deps.retrieveWorkouts ||
    ((targetArg?: string, semesterArg?: string) =>
      defaultRetrieveWorkouts(targetArg, semesterArg, deps.localeBucket));
  const warn = deps.warn || ((message: string) => console.warn(message));
  const log = deps.log || ((message: string) => console.log(message));
  const translateText =
    deps.translateText ||
    (deps.translationApiKey
      ? buildGoogleTranslateText(deps.translationApiKey, deps.fetchImpl)
      : undefined);

  log(
    `Starting public snapshot build for version ${version}${target ? ` (target=${target})` : ""}`,
  );

  let workoutsInput: any[] = [];

  if (includeWorkouts) {
    try {
      workoutsInput = await retrieveWorkouts(
        target,
        options.workoutSemester ?? buildCurrentWorkoutSemester(),
      );
      log(`Retrieved ${workoutsInput.length} workout records`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn(`Failed to retrieve workouts: ${detail}`);
    }
  }

  if (
    workoutsInput.length > 0 &&
    deps.localeBucket?.put &&
    deps.localeBucket?.get
  ) {
    try {
      log(
        `Syncing workout locale maps for ${workoutsInput.length} workout records`,
      );
      await syncWorkoutLocaleMaps(
        workoutsInput,
        deps.localeBucket,
        version,
        translateText,
        deps.seedWorkoutLocaleKeys,
      );
      log("Finished syncing workout locale maps");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn(`Failed to sync workout locale maps: ${detail}`);
    }
  }

  const result: PublicSnapshots = { version };

  if (workoutsInput.length > 0) {
    result.workouts = buildWorkoutsSnapshot(
      workoutsInput.map(normalizeWorkoutForSnapshot),
      version,
    );
    result.workouts.manifest.titleLocaleKey =
      buildWorkoutTitleLocaleKey(version);
    result.workouts.manifest.categoryLocaleKey =
      buildWorkoutCategoryLocaleKey(version);
    result.workouts.manifest.metadataLocaleKey =
      buildWorkoutMetadataLocaleKey(version);
    result.workouts.manifest.wikipediaLocaleKey =
      buildWorkoutWikipediaLocaleKey(version);
    log(
      `Built workout snapshot with ${result.workouts.manifest.itemCount} items`,
    );
  }

  log(
    `Finished public snapshot build for version ${version} with ${result.workouts?.manifest.itemCount || 0} workout items`,
  );

  return result;
}
