import { describe, expect, test } from "vitest";
import {
  isCoursesBrowseSnapshot,
  isCoursesDetailSnapshot,
  isManifestSnapshot,
  isWorkoutsBrowseSnapshot,
  isWorkoutsDetailSnapshot,
} from "../schema";

const manifest = {
  version: "2026-03-15T12-00-00Z",
  generatedAt: "2026-03-15T12:00:00.000Z",
  browseKey: "courses/browse/2026-03-15T12-00-00Z.json",
  detailKey: "courses/detail/2026-03-15T12-00-00Z.json",
  itemCount: 4,
};

const coursesBrowse = [
  {
    id: "mit-6.006",
    slug: "mit-6-006-introduction-to-algorithms",
    title: "Introduction to Algorithms",
    courseCode: "6.006",
    university: "MIT",
    credit: 12,
    level: "Undergraduate",
    department: "EECS",
    subdomain: "Computer Science",
    category: "Algorithms",
    latestSemester: "Fall 2025",
    url: "https://ocw.mit.edu/courses/6-006",
    excerpt: "Design and analysis of algorithms.",
    searchText: "introduction to algorithms mit 6.006 eecs computer science algorithms",
  },
  {
    id: "stanford-cs229",
    slug: "stanford-cs229-machine-learning",
    title: "Machine Learning",
    courseCode: "CS229",
    university: "Stanford",
    credit: 3,
    level: "Graduate",
    department: "Computer Science",
    subdomain: "AI",
    category: "Machine Learning",
    latestSemester: "Autumn 2025",
    url: "https://stanford.edu/cs229",
    excerpt: "Supervised and unsupervised learning.",
    searchText: "machine learning stanford cs229 computer science ai",
  },
  {
    id: "ucb-cs61a",
    slug: "ucb-cs61a-structure-and-interpretation-of-computer-programs",
    title: "Structure and Interpretation of Computer Programs",
    courseCode: "CS61A",
    university: "UCB",
    credit: 4,
    level: "Undergraduate",
    department: "EECS",
    subdomain: "Programming",
    category: "Foundations",
    latestSemester: "Spring 2026",
    url: "https://berkeley.edu/cs61a",
    excerpt: "Programming abstractions and interpretation.",
    searchText: "structure interpretation programs ucb cs61a eecs programming foundations",
  },
  {
    id: "cmu-15-213",
    slug: "cmu-15-213-introduction-to-computer-systems",
    title: "Introduction to Computer Systems",
    courseCode: "15-213",
    university: "CMU",
    credit: 12,
    level: "Undergraduate",
    department: "Computer Science",
    subdomain: "Systems",
    category: "Computer Systems",
    latestSemester: "Spring 2026",
    url: "https://cmu.edu/15-213",
    excerpt: "Machine-level programming and systems.",
    searchText: "introduction computer systems cmu 15-213 systems computer science",
  },
];

const coursesDetail = {
  "mit-6.006": {
    id: "mit-6.006",
    slug: "mit-6-006-introduction-to-algorithms",
    title: "Introduction to Algorithms",
    courseCode: "6.006",
    university: "MIT",
    description: "Full public-safe description.",
    credit: 12,
    level: "Undergraduate",
    department: "EECS",
    subdomain: "Computer Science",
    category: "Algorithms",
    latestSemester: "Fall 2025",
    resources: ["https://ocw.mit.edu/courses/6-006/resources/"],
    instructors: ["Erik Demaine"],
    url: "https://ocw.mit.edu/courses/6-006",
  },
};

const workoutsBrowse = [
  {
    id: "workout-spin-01",
    slug: "spin-intervals-monday-evening",
    title: "Spin Intervals",
    provider: "UniSport",
    category: "Cycling",
    weekday: "Monday",
    timeLabel: "18:00-19:00",
    location: "Studio A",
    bookingUrl: "https://example.com/book/spin",
    excerpt: "High-intensity bike intervals.",
    searchText: "spin intervals unisport cycling monday studio a",
  },
];

const workoutsDetail = {
  "workout-spin-01": {
    id: "workout-spin-01",
    slug: "spin-intervals-monday-evening",
    title: "Spin Intervals",
    provider: "UniSport",
    category: "Cycling",
    description: "High-intensity interval training on stationary bikes.",
    schedule: [{ day: "Monday", time: "18:00-19:00", location: "Studio A" }],
    location: ["Studio A", "Studio B"],
    url: "https://example.com/workouts/spin",
  },
};

describe("public snapshot schema guards", () => {
  test("accepts a valid manifest snapshot", () => {
    expect(isManifestSnapshot(manifest)).toBe(true);
  });

  test("accepts valid MIT, Stanford, UCB, and CMU course browse rows", () => {
    expect(isCoursesBrowseSnapshot(coursesBrowse)).toBe(true);
  });

  test("accepts a valid course detail snapshot", () => {
    expect(isCoursesDetailSnapshot(coursesDetail)).toBe(true);
  });

  test("accepts a valid workouts browse snapshot", () => {
    expect(isWorkoutsBrowseSnapshot(workoutsBrowse)).toBe(true);
  });

  test("accepts a valid workouts detail snapshot", () => {
    expect(isWorkoutsDetailSnapshot(workoutsDetail)).toBe(true);
  });
});
