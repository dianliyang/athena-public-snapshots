export type ManifestSnapshot = {
  version: string;
  generatedAt: string;
  browseKey: string;
  detailKey: string;
  titleLocaleKey?: string;
  categoryLocaleKey?: string;
  itemCount: number;
};

export type CourseBrowseRecord = {
  id: string;
  slug: string;
  title: string;
  courseCode: string;
  university: "MIT" | "Stanford" | "UCB" | "CMU";
  credit: number | null;
  level: string | null;
  department: string | null;
  subdomain: string | null;
  category: string | null;
  latestSemester: string | null;
  url: string | null;
  excerpt: string | null;
  searchText: string;
};

export type CourseDetailRecord = {
  id: string;
  slug: string;
  title: string;
  courseCode: string;
  university: "MIT" | "Stanford" | "UCB" | "CMU";
  description: string | null;
  credit: number | null;
  level: string | null;
  department: string | null;
  subdomain: string | null;
  category: string | null;
  latestSemester: string | null;
  resources: string[];
  instructors: string[];
  url: string | null;
};

export type CoursesBrowseSnapshot = CourseBrowseRecord[];
export type CoursesDetailSnapshot = Record<string, CourseDetailRecord>;

const UNIVERSITIES = new Set(["MIT", "Stanford", "UCB", "CMU"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isCourseBrowseRecord(value: unknown): value is CourseBrowseRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.courseCode === "string" &&
    typeof value.university === "string" &&
    UNIVERSITIES.has(value.university) &&
    (typeof value.credit === "number" || value.credit === null) &&
    isNullableString(value.level) &&
    isNullableString(value.department) &&
    isNullableString(value.subdomain) &&
    isNullableString(value.category) &&
    isNullableString(value.latestSemester) &&
    isNullableString(value.url) &&
    isNullableString(value.excerpt) &&
    typeof value.searchText === "string"
  );
}

function isCourseDetailRecord(value: unknown): value is CourseDetailRecord {
  if (!isObject(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    typeof value.courseCode === "string" &&
    typeof value.university === "string" &&
    UNIVERSITIES.has(value.university) &&
    isNullableString(value.description) &&
    (typeof value.credit === "number" || value.credit === null) &&
    isNullableString(value.level) &&
    isNullableString(value.department) &&
    isNullableString(value.subdomain) &&
    isNullableString(value.category) &&
    isNullableString(value.latestSemester) &&
    isStringArray(value.resources) &&
    isStringArray(value.instructors) &&
    isNullableString(value.url)
  );
}

export function isManifestSnapshot(value: unknown): value is ManifestSnapshot {
  return (
    isObject(value) &&
    typeof value.version === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.browseKey === "string" &&
    typeof value.detailKey === "string" &&
    (value.titleLocaleKey === undefined || typeof value.titleLocaleKey === "string") &&
    (value.categoryLocaleKey === undefined || typeof value.categoryLocaleKey === "string") &&
    typeof value.itemCount === "number"
  );
}

export function isCoursesBrowseSnapshot(value: unknown): value is CoursesBrowseSnapshot {
  return Array.isArray(value) && value.every(isCourseBrowseRecord);
}

export function isCoursesDetailSnapshot(value: unknown): value is CoursesDetailSnapshot {
  return isObject(value) && Object.values(value).every(isCourseDetailRecord);
}
