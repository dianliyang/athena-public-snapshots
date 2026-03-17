import { describe, expect, test } from "vitest";
import { buildWorkoutsSnapshot } from "../build/build-workouts-snapshot";

const input = [
  {
    id: "spin-01",
    title: "Spin Intervals",
    provider: "UniSport",
    category: "Cycling",
    description: {
      general: "High-intensity interval training on stationary bikes.",
      price: "Single-session booking available.",
    },
    weekday: "Monday",
    timeLabel: "18:00-19:00",
    location: ["Studio A", "Studio B"],
    bookingUrl: "https://example.com/book/spin",
    url: "https://example.com/workouts/spin",
    price: {
      student: 12.9,
      staff: null,
      external: 16.9,
      externalReduced: 9.9,
      adults: 16.9,
      children: 9.9,
      discount: 12.9,
    },
    internalOnly: true,
  },
];

describe("buildWorkoutsSnapshot", () => {
  test("builds browse and detail rows with slugs and search text", () => {
    const snapshot = buildWorkoutsSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.browse[0]?.slug).toBe("spin-intervals");
    expect(snapshot.browse[0]?.searchText).toContain("spin intervals");
    expect(snapshot.browse[0]?.searchText).toContain("studio a");
    expect(snapshot.browse[0]?.searchText).toContain("studio b");
    expect(snapshot.detail["spin-01"]?.slug).toBe("spin-intervals");
    expect(snapshot.detail["spin-01"]?.location).toEqual(["Studio A", "Studio B"]);
    expect(snapshot.detail["spin-01"]?.description).toEqual({
      general: "High-intensity interval training on stationary bikes.",
      price: "Single-session booking available.",
    });
    expect(snapshot.detail["spin-01"]?.price).toEqual({
      student: 12.9,
      staff: null,
      external: 16.9,
      externalReduced: 9.9,
      adults: 16.9,
      children: 9.9,
      discount: 12.9,
    });
  });

  test("excludes non-public fields and emits manifest keys", () => {
    const snapshot = buildWorkoutsSnapshot(input, "2026-03-15T12-00-00Z");
    expect(snapshot.browse[0]).not.toHaveProperty("internalOnly");
    expect(snapshot.detail["spin-01"]).not.toHaveProperty("internalOnly");
    expect(snapshot.detail["spin-01"]).not.toHaveProperty("bookingUrl");
    expect(snapshot.manifest).toEqual({
      version: "2026-03-15T12-00-00Z",
      generatedAt: "2026-03-15T12-00-00Z",
      browseKey: "workouts/browse/2026-03-15T12-00-00Z.json",
      detailKey: "workouts/detail/2026-03-15T12-00-00Z.json",
      itemCount: 1,
    });
  });
});
