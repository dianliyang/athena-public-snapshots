import { describe, expect, test } from "vitest";
import { buildWorkoutsSnapshot } from "../build/build-workouts-snapshot";

const input = [
  {
    id: "spin-01",
    title: "Spin Intervals",
    provider: "UniSport",
    category: "Cycling",
    weekday: "Monday",
    timeLabel: "18:00-19:00",
    location: "Studio A",
    bookingUrl: "https://example.com/book/spin",
    url: "https://example.com/workouts/spin",
    description: "High-intensity interval training on stationary bikes.",
    internalOnly: true,
  },
];

describe("buildWorkoutsSnapshot", () => {
  test("builds browse and detail rows with slugs and search text", () => {
    const snapshot = buildWorkoutsSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.browse[0]?.slug).toBe("spin-intervals");
    expect(snapshot.browse[0]?.searchText).toContain("spin intervals");
    expect(snapshot.detail["spin-01"]?.slug).toBe("spin-intervals");
  });

  test("excludes non-public fields and emits manifest keys", () => {
    const snapshot = buildWorkoutsSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.browse[0]).not.toHaveProperty("internalOnly");
    expect(snapshot.detail["spin-01"]).not.toHaveProperty("internalOnly");
    expect(snapshot.manifest).toEqual({
      version: "2026-03-15T12-00-00Z",
      generatedAt: "2026-03-15T12-00-00Z",
      browseKey: "workouts/browse/2026-03-15T12-00-00Z.json",
      detailKey: "workouts/detail/2026-03-15T12-00-00Z.json",
      itemCount: 1,
    });
  });
});
