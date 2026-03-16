export type WorkoutBrowseRecord = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  category: string | null;
  searchText: string;
};

export type WorkoutDetailRecord = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  category: string | null;
  description: string | null;
  schedule: Array<{
    day: string;
    time: string;
    location: string;
  }>;
  location: string | null;
  bookingUrl: string | null;
  url: string | null;
  
  // Flattened details
  instructor?: string;
  startDate?: string;
  endDate?: string;
  priceStudent?: number | null;
  priceStaff?: number | null;
  priceExternal?: number | null;
  priceExternalReduced?: number | null;
  bookingStatus?: string;
  semester?: string;
  isEntgeltfrei?: boolean;
  bookingLabel?: string;
  bookingOpensOn?: string;
  bookingOpensAt?: string;
  plannedDates?: string[];
  durationUrl?: string;
};

export type WorkoutsBrowseSnapshot = WorkoutBrowseRecord[];
export type WorkoutsDetailSnapshot = Record<string, WorkoutDetailRecord>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isWorkoutBrowseRecord(value: unknown): value is WorkoutBrowseRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.provider === "string" &&
    isNullableString(value.category) &&
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
    Array.isArray(value.schedule) &&
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
