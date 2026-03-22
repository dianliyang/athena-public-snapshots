export interface WorkoutCourse {
  source: string;
  courseCode: string;
  category: string;
  title: string;
  description?: {
    general?: string;
    price?: string;
    notes?: string[];
  } | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string[];
  instructor: string;
  startDate: string;
  endDate: string;
  price: {
    student: number | null;
    staff: number | null;
    external: number | null;
    externalReduced: number | null;
  };
  bookingStatus: string;
  bookingUrl: string;
  url: string;
  semester: string;
  duration?: string;
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
  sessionCount?: number;
  segments?: Array<{ start: string; end: string; day: string }>;
  durationUrl?: string | null;
}
