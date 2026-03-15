import type {
  CourseBrowseRecord,
  CourseDetailRecord,
  CoursesBrowseSnapshot,
  CoursesDetailSnapshot,
  ManifestSnapshot,
} from "../schema";

type InputCourse = {
  id: string | number;
  title: string;
  courseCode: string;
  university: string;
  credit?: number | null;
  level?: string | null;
  department?: string | null;
  subdomain?: string | null;
  category?: string | null;
  latestSemester?: string | null;
  url?: string | null;
  description?: string | null;
  resources?: string[];
  instructors?: string[];
};

const PUBLIC_UNIVERSITIES = new Set(["MIT", "Stanford", "UCB", "CMU"]);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildSearchText(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function buildExcerpt(description: string | null | undefined): string | null {
  const text = String(description || "").trim();
  return text || null;
}

export function buildCoursesSnapshot(
  items: InputCourse[],
  version: string,
): {
  manifest: ManifestSnapshot;
  browse: CoursesBrowseSnapshot;
  detail: CoursesDetailSnapshot;
} {
  const browse: CoursesBrowseSnapshot = [];
  const detail: CoursesDetailSnapshot = {};

  for (const item of items) {
    if (!PUBLIC_UNIVERSITIES.has(item.university)) continue;

    const id = String(item.id);
    const slug = slugify(`${item.university} ${item.courseCode} ${item.title}`);
    const browseRow: CourseBrowseRecord = {
      id,
      slug,
      title: item.title,
      courseCode: item.courseCode,
      university: item.university as CourseBrowseRecord["university"],
      credit: item.credit ?? null,
      level: item.level ?? null,
      department: item.department ?? null,
      subdomain: item.subdomain ?? null,
      category: item.category ?? null,
      latestSemester: item.latestSemester ?? null,
      url: item.url ?? null,
      excerpt: buildExcerpt(item.description),
      searchText: buildSearchText([
        item.title,
        item.university,
        item.courseCode,
        item.department,
        item.subdomain,
        item.category,
      ]),
    };

    const detailRow: CourseDetailRecord = {
      id,
      slug,
      title: item.title,
      courseCode: item.courseCode,
      university: item.university as CourseDetailRecord["university"],
      description: item.description ?? null,
      credit: item.credit ?? null,
      level: item.level ?? null,
      department: item.department ?? null,
      subdomain: item.subdomain ?? null,
      category: item.category ?? null,
      latestSemester: item.latestSemester ?? null,
      resources: Array.isArray(item.resources) ? item.resources : [],
      instructors: Array.isArray(item.instructors) ? item.instructors : [],
      url: item.url ?? null,
    };

    browse.push(browseRow);
    detail[id] = detailRow;
  }

  return {
    manifest: {
      version,
      generatedAt: version,
      browseKey: `courses/browse/${version}.json`,
      detailKey: `courses/detail/${version}.json`,
      itemCount: browse.length,
    },
    browse,
    detail,
  };
}
