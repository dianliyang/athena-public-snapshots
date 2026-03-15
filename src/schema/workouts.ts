export type WorkoutBrowseRecord = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  category: string | null;
  weekday: string | null;
  timeLabel: string | null;
  location: string | null;
  bookingUrl: string | null;
  excerpt: string | null;
  searchText: string;
};

export type WorkoutDetailRecord = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  category: string | null;
  description: string | null;
  schedule: string[];
  location: string | null;
  bookingUrl: string | null;
  url: string | null;
};

export type WorkoutsBrowseSnapshot = WorkoutBrowseRecord[];
export type WorkoutsDetailSnapshot = Record<string, WorkoutDetailRecord>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isWorkoutBrowseRecord(value: unknown): value is WorkoutBrowseRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.provider === "string" &&
    isNullableString(value.category) &&
    isNullableString(value.weekday) &&
    isNullableString(value.timeLabel) &&
    isNullableString(value.location) &&
    isNullableString(value.bookingUrl) &&
    isNullableString(value.excerpt) &&
    typeof value.searchText === "string"
  );
}

function isWorkoutDetailRecord(value: unknown): value is WorkoutDetailRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.provider === "string" &&
    isNullableString(value.category) &&
    isNullableString(value.description) &&
    isStringArray(value.schedule) &&
    isNullableString(value.location) &&
    isNullableString(value.bookingUrl) &&
    isNullableString(value.url)
  );
}

export function isWorkoutsBrowseSnapshot(value: unknown): value is WorkoutsBrowseSnapshot {
  return Array.isArray(value) && value.every(isWorkoutBrowseRecord);
}

export function isWorkoutsDetailSnapshot(value: unknown): value is WorkoutsDetailSnapshot {
  return isObject(value) && Object.values(value).every(isWorkoutDetailRecord);
}
