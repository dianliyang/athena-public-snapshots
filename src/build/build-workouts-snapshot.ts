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
  location?: string | null;
  bookingUrl?: string | null;
  url?: string | null;
  description?: string | null;
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
      weekday: item.weekday ?? null,
      timeLabel: item.timeLabel ?? null,
      location: item.location ?? null,
      bookingUrl: item.bookingUrl ?? null,
      excerpt: item.description ?? null,
      searchText: buildSearchText([item.title, item.provider, item.category, item.weekday, item.location]),
    };

    const schedule = item.weekday && item.timeLabel
      ? [`${item.weekday} ${item.timeLabel}`]
      : item.weekday
        ? [item.weekday]
        : item.timeLabel
          ? [item.timeLabel]
          : [];

    const detailRow: WorkoutDetailRecord = {
      id,
      slug,
      title: item.title,
      provider: item.provider,
      category: item.category ?? null,
      description: item.description ?? null,
      schedule,
      location: item.location ?? null,
      bookingUrl: item.bookingUrl ?? null,
      url: item.url ?? null,
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
