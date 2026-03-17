import type {
  ManifestSnapshot,
  WorkoutBrowseRecord,
  WorkoutDetailRecord,
  WorkoutsBrowseSnapshot,
  WorkoutsDetailSnapshot,
} from "../schema";

type InputWorkout = {
  id: string | number;
  title: string;
  provider: string;
  category?: string | null;
  weekday?: string | null;
  timeLabel?: string | null;
  location?: string[] | null;
  bookingUrl?: string | null;
  url?: string | null;
  description?: string | null;
  
  // Flattened details from scraper
  instructor?: string;
  startDate?: string;
  endDate?: string;
  priceStudent?: number | null;
  priceStaff?: number | null;
  priceExternal?: number | null;
  priceExternalReduced?: number | null;
  bookingStatus?: string;
  semester?: string;
  schedule?: Array<{
    day: string;
    time: string;
    location: string;
  }>;
  isEntgeltfrei?: boolean;
  bookingLabel?: string;
  bookingOpensOn?: string;
  bookingOpensAt?: string;
  plannedDates?: string[];
  durationUrl?: string | null;
};

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

function flattenSearchPart(part: string | string[] | number | null | undefined): Array<string | number> {
  if (Array.isArray(part)) return part.filter(Boolean);
  if (part === null || part === undefined) return [];
  return [part];
}

export function buildWorkoutsSnapshot(
  items: InputWorkout[],
  version: string,
): {
  manifest: ManifestSnapshot;
  browse: WorkoutsBrowseSnapshot;
  detail: WorkoutsDetailSnapshot;
} {
  const browse: WorkoutsBrowseSnapshot = [];
  const detail: WorkoutsDetailSnapshot = {};

  for (const item of items) {
    const id = String(item.id);
    const slug = slugify(item.title);

    const browseRow: WorkoutBrowseRecord = {
      id,
      slug,
      title: item.title,
      provider: item.provider,
      category: item.category ?? null,
      searchText: buildSearchText([
        item.title,
        item.provider,
        item.category,
        item.weekday,
        ...flattenSearchPart(item.location),
      ]),
    };

    const schedule = item.schedule || (item.weekday && item.timeLabel
      ? [{ day: item.weekday, time: item.timeLabel, location: item.location?.[0] || "" }]
      : item.weekday
        ? [{ day: item.weekday, time: "", location: item.location?.[0] || "" }]
        : item.timeLabel
          ? [{ day: "", time: item.timeLabel, location: item.location?.[0] || "" }]
          : []);

    const detailRow: WorkoutDetailRecord = {
      id,
      slug,
      title: item.title,
      provider: item.provider,
      category: item.category ?? null,
      description: item.description ?? null,
      schedule,
      location: item.location ?? null,
      url: item.url ?? null,
      
      instructor: item.instructor,
      startDate: item.startDate,
      endDate: item.endDate,
      priceStudent: item.priceStudent,
      priceStaff: item.priceStaff,
      priceExternal: item.priceExternal,
      priceExternalReduced: item.priceExternalReduced,
      bookingStatus: item.bookingStatus,
      semester: item.semester,
      isEntgeltfrei: item.isEntgeltfrei,
      bookingLabel: item.bookingLabel,
      bookingOpensOn: item.bookingOpensOn,
      bookingOpensAt: item.bookingOpensAt,
      plannedDates: item.plannedDates,
      durationUrl: item.durationUrl || undefined,
    };

    browse.push(browseRow);
    detail[id] = detailRow;
  }

  return {
    manifest: {
      version,
      generatedAt: version,
      browseKey: `workouts/browse/${version}.json`,
      detailKey: `workouts/detail/${version}.json`,
      itemCount: browse.length,
    },
    browse,
    detail,
  };
}
