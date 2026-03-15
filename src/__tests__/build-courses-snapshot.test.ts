import { describe, expect, test } from "vitest";
import { buildCoursesSnapshot } from "../build/build-courses-snapshot";

const input = [
  {
    id: 1,
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
    description: "Design and analysis of algorithms.",
    resources: ["https://ocw.mit.edu/courses/6-006/resources/"],
    instructors: ["Erik Demaine"],
    internalNotes: "exclude me",
  },
  {
    id: 2,
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
    description: "Supervised and unsupervised learning.",
    resources: [],
    instructors: ["Andrew Ng"],
  },
  {
    id: 3,
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
    description: "Programming abstractions and interpretation.",
    resources: [],
    instructors: ["John DeNero"],
  },
  {
    id: 4,
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
    description: "Machine-level programming and systems.",
    resources: [],
    instructors: ["Randy Bryant"],
  },
  {
    id: 5,
    title: "Distributed Systems",
    courseCode: "CS-999",
    university: "Other University",
    credit: 5,
    level: "Graduate",
    department: "CS",
    subdomain: "Systems",
    category: "Distributed Systems",
    latestSemester: "Winter 2026",
    url: "https://example.com/cs999",
    description: "Should be excluded.",
    resources: [],
    instructors: [],
  },
];

describe("buildCoursesSnapshot", () => {
  test("filters courses to MIT, Stanford, UCB, and CMU only", () => {
    const snapshot = buildCoursesSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.manifest.itemCount).toBe(4);
    expect(snapshot.browse.map((item) => item.university)).toEqual(["MIT", "Stanford", "UCB", "CMU"]);
  });

  test("builds browse and detail rows with slugs and search text", () => {
    const snapshot = buildCoursesSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.browse[0]?.slug).toBe("mit-6-006-introduction-to-algorithms");
    expect(snapshot.browse[0]?.searchText).toContain("introduction to algorithms");
    expect(snapshot.detail["1"]?.slug).toBe("mit-6-006-introduction-to-algorithms");
  });

  test("excludes non-public fields from browse and detail payloads", () => {
    const snapshot = buildCoursesSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.browse[0]).not.toHaveProperty("internalNotes");
    expect(snapshot.detail["1"]).not.toHaveProperty("internalNotes");
  });

  test("emits versioned manifest keys", () => {
    const snapshot = buildCoursesSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.manifest).toEqual({
      version: "2026-03-15T12-00-00Z",
      generatedAt: "2026-03-15T12-00-00Z",
      browseKey: "courses/browse/2026-03-15T12-00-00Z.json",
      detailKey: "courses/detail/2026-03-15T12-00-00Z.json",
      itemCount: 4,
    });
  });
});
