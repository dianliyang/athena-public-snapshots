import type {
  ManifestSnapshot,
  WorkoutDetailRecord,
  WorkoutPrice,
  WorkoutsDetailSnapshot,
} from "../schema";

type InputWorkout = {
  id: string | number;
  title: string;
  provider: string;
  category?: string | null;
  description?: {
    general?: string;
    price?: string;
  } | null;
  weekday?: string | null;
  timeLabel?: string | null;
  location?: string[] | null;
  bookingUrl?: string | null;
  url?: string | null;
  
  // Flattened details from scraper
  instructor?: string;
  startDate?: string;
  endDate?: string;
  price?: WorkoutPrice;
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

export function buildWorkoutsSnapshot(
  items: InputWorkout[],
  version: string,
): {
  manifest: ManifestSnapshot;
  detail: WorkoutsDetailSnapshot;
} {
  const detail: WorkoutsDetailSnapshot = {};

  for (const item of items) {
    const id = String(item.id);
    const slug = slugify(item.title);

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
      price: item.price,
      bookingStatus: item.bookingStatus,
      semester: item.semester,
      isEntgeltfrei: item.isEntgeltfrei,
      bookingLabel: item.bookingLabel,
      bookingOpensOn: item.bookingOpensOn,
      bookingOpensAt: item.bookingOpensAt,
      plannedDates: item.plannedDates,
      durationUrl: item.durationUrl || undefined,
    };
    detail[id] = detailRow;
  }

  return {
    manifest: {
      version,
      generatedAt: version,
      detailKey: `workouts/detail/${version}.json`,
      itemCount: Object.keys(detail).length,
    },
    detail,
  };
}
