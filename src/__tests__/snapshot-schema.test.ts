import { describe, expect, test } from "vitest";
import {
  isManifestSnapshot,
  isWorkoutsDetailSnapshot,
} from "../schema";

const manifest = {
  version: "2026-03-15T12-00-00Z",
  generatedAt: "2026-03-15T12:00:00.000Z",
  detailKey: "workouts/detail/2026-03-15T12-00-00Z.json",
  titleLocaleKey: "workouts/locales/title/2026-03-15T12-00-00Z.json",
  categoryLocaleKey: "workouts/locales/category/2026-03-15T12-00-00Z.json",
  metadataLocaleKey: "workouts/locales/metadata/2026-03-15T12-00-00Z.json",
  wikipediaLocaleKey: "workouts/locales/wikipedia/2026-03-15T12-00-00Z.json",
  itemCount: 4,
};

const workoutsDetail = {
  "workout-spin-01": {
    id: "workout-spin-01",
    slug: "spin-intervals-monday-evening",
    title: "Spin Intervals",
    provider: "UniSport",
    category: "Cycling",
    schedule: [{ day: "Monday", time: "18:00-19:00", location: "Studio A" }],
    location: ["Studio A", "Studio B"],
    url: "https://example.com/workouts/spin",
    sessionCount: 3,
    price: {
      student: 12.9,
      staff: null,
      external: 16.9,
      externalReduced: 9.9,
      adults: 16.9,
      children: 9.9,
      discount: 12.9,
    },
  },
};

describe("public snapshot schema guards", () => {
  test("accepts a valid manifest snapshot", () => {
    expect(isManifestSnapshot(manifest)).toBe(true);
  });

  test("accepts a valid workouts detail snapshot", () => {
    expect(isWorkoutsDetailSnapshot(workoutsDetail)).toBe(true);
  });
});
