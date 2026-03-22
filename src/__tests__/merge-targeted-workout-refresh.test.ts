import { describe, expect, test } from "vitest";
import { mergeTargetedWorkoutRefresh } from "../pipeline/merge-targeted-workout-refresh";

describe("mergeTargetedWorkoutRefresh", () => {
  test("replaces only the targeted provider and retains other published workouts", () => {
    const merged = mergeTargetedWorkoutRefresh(
      "haw-kiel-sport",
      [
        {
          id: "cau-yoga",
          slug: "yoga",
          title: "Yoga",
          provider: "CAU Kiel Sportzentrum",
          category: "Mind & Body",
          description: null,
          schedule: [],
          location: ["Kiel"],
          url: "https://example.com/cau-yoga",
        },
        {
          id: "haw-old",
          slug: "tischfussball",
          title: "Tischfußball",
          provider: "HAW Kiel Hochschulsport",
          category: "Ballsportarten",
          description: null,
          schedule: [],
          location: ["Campus Center Kiel"],
          url: "https://haw-kiel.venuzle.com/events/120",
        },
      ],
      {
        "haw-new": {
          id: "haw-new",
          slug: "jugger",
          title: "Jugger",
          provider: "HAW Kiel Hochschulsport",
          category: "Ballsportarten",
          description: null,
          schedule: [],
          location: ["Campus Center Kiel"],
          url: "https://haw-kiel.venuzle.com/events/121",
        },
      },
      {
        version: "2026-03-22T12-00-00Z",
        generatedAt: "2026-03-22T12-00-00Z",
        detailKey: "workouts/detail/2026-03-22T12-00-00Z.json",
        itemCount: 1,
      },
    );

    expect(Object.keys(merged.detail).sort()).toEqual(["cau-yoga", "haw-new"]);
    expect(merged.detail["cau-yoga"]?.provider).toBe("CAU Kiel Sportzentrum");
    expect(merged.detail["haw-new"]?.provider).toBe("HAW Kiel Hochschulsport");
    expect(merged.manifest.itemCount).toBe(2);
  });
});
