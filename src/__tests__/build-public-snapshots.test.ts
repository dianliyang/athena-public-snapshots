import { describe, expect, test } from "vitest";
import { buildPublicSnapshots } from "../pipeline/build-public-snapshots";

describe("buildPublicSnapshots", () => {
  test("builds course and workout snapshots in memory", async () => {
    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z" },
      {
        retrieveCourses: async () => [
          {
            id: "mit-6.006",
            title: "Introduction to Algorithms",
            courseCode: "6.006",
            university: "MIT",
            description: "Algorithms.",
          },
        ],
        retrieveWorkouts: async () => [
          {
            id: "cau-1234-01",
            title: "Yoga",
            provider: "CAU Kiel Sportzentrum",
            category: "Mind & Body",
            location: ["Hall 1", "Hall 2"],
          },
        ],
      },
    );

    expect(snapshots.version).toBe("2026-03-17T10-00-00Z");
    expect(snapshots.courses?.manifest.browseKey).toBe("courses/browse/2026-03-17T10-00-00Z.json");
    expect(snapshots.workouts?.detail["cau-1234-01"]?.location).toEqual(["Hall 1", "Hall 2"]);
  });
});
