import { describe, expect, test } from "vitest";
import { retrievePublishedWorkoutDetails } from "../pipeline/retrieve-published-workout-details";

type BucketObject = { text(): Promise<string> };

class FakeBucket {
  constructor(private readonly values: Record<string, string>) {}

  async get(key: string): Promise<BucketObject | null> {
    const value = this.values[key];
    if (!value) return null;

    return {
      async text() {
        return value;
      },
    };
  }
}

describe("retrievePublishedWorkoutDetails", () => {
  test("loads the latest published workout detail snapshot from manifest", async () => {
    const workouts = await retrievePublishedWorkoutDetails(new FakeBucket({
      "workouts/manifest.json": JSON.stringify({
        version: "2026-03-20T11-26-38-050Z",
        generatedAt: "2026-03-20T11-26-38-050Z",
        detailKey: "workouts/detail/2026-03-20T11-26-38-050Z.json",
        itemCount: 1,
      }),
      "workouts/detail/2026-03-20T11-26-38-050Z.json": JSON.stringify({
        "spin-01": {
          id: "spin-01",
          slug: "spin-intervals",
          title: "Spin Intervals",
          provider: "UniSport",
          category: "Cycling",
          schedule: [],
          location: ["Studio A"],
          url: "https://example.com/spin",
        },
      }),
    }));

    expect(workouts).toEqual([
      expect.objectContaining({
        id: "spin-01",
        title: "Spin Intervals",
      }),
    ]);
  });

  test("throws when the published workouts manifest is missing", async () => {
    await expect(
      retrievePublishedWorkoutDetails(new FakeBucket({})),
    ).rejects.toThrow("Missing workouts manifest");
  });

  test("throws when the published workouts detail snapshot is missing", async () => {
    await expect(
      retrievePublishedWorkoutDetails(new FakeBucket({
        "workouts/manifest.json": JSON.stringify({
          version: "2026-03-20T11-26-38-050Z",
          generatedAt: "2026-03-20T11-26-38-050Z",
          detailKey: "workouts/detail/2026-03-20T11-26-38-050Z.json",
          itemCount: 1,
        }),
      })),
    ).rejects.toThrow("Missing workouts detail snapshot");
  });
});
