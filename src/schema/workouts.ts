export type WorkoutPrice = {
  student?: number | null;
  staff?: number | null;
  external?: number | null;
  externalReduced?: number | null;
  adults?: number | null;
  children?: number | null;
  discount?: number | null;
};

export type WorkoutDetailRecord = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  category: string | null;
  schedule: Array<{
    day: string;
    time: string;
    location: string;
  }>;
  location: string[] | null;
  url: string | null;
  
  // Flattened details
  instructor?: string;
  startDate?: string;
  endDate?: string;
  price?: WorkoutPrice;
  bookingStatus?: string;
  semester?: string;
  isEntgeltfrei?: boolean;
  bookingLabel?: string;
  bookingOpensOn?: string;
  bookingOpensAt?: string;
  plannedDates?: string[];
  sessionCount?: number;
  durationUrl?: string;
};

export type WorkoutsDetailSnapshot = Record<string, WorkoutDetailRecord>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isNullableStringArray(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}

function isWorkoutPrice(value: unknown): value is WorkoutPrice | undefined {
  return (
    value === undefined ||
    (isObject(value) &&
      (value.student === undefined || isNullableNumber(value.student)) &&
      (value.staff === undefined || isNullableNumber(value.staff)) &&
      (value.external === undefined || isNullableNumber(value.external)) &&
      (value.externalReduced === undefined || isNullableNumber(value.externalReduced)) &&
      (value.adults === undefined || isNullableNumber(value.adults)) &&
      (value.children === undefined || isNullableNumber(value.children)) &&
      (value.discount === undefined || isNullableNumber(value.discount)))
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
    Array.isArray(value.schedule) &&
    isNullableStringArray(value.location) &&
    isNullableString(value.url) &&
    (value.sessionCount === undefined || typeof value.sessionCount === "number") &&
    isWorkoutPrice(value.price)
  );
}

export function isWorkoutsDetailSnapshot(value: unknown): value is WorkoutsDetailSnapshot {
  return isObject(value) && Object.values(value).every(isWorkoutDetailRecord);
}
