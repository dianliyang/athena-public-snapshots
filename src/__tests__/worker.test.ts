import { describe, expect, test } from "vitest";
import { createWorker } from "../worker";
import type { R2BucketLike } from "../publish/publish-to-r2";

class FakeBucket implements R2BucketLike {
  public writes: Array<{ key: string; value: string }> = [];

  async put(key: string, value: string): Promise<void> {
    this.writes.push({ key, value });
  }
}

describe("worker scheduled publish", () => {
  test("publishes course and workout JSON snapshots to R2", async () => {
    const bucket = new FakeBucket();
    const worker = createWorker({
      buildPublicSnapshots: async () => ({
        version: "2026-03-17T10-00-00Z",
        courses: {
          manifest: {
            version: "2026-03-17T10-00-00Z",
            generatedAt: "2026-03-17T10-00-00Z",
            browseKey: "courses/browse/2026-03-17T10-00-00Z.json",
            detailKey: "courses/detail/2026-03-17T10-00-00Z.json",
            itemCount: 1,
          },
          browse: [{ id: "mit-6.006" }],
          detail: { "mit-6.006": { id: "mit-6.006" } },
        },
        workouts: {
          manifest: {
            version: "2026-03-17T10-00-00Z",
            generatedAt: "2026-03-17T10-00-00Z",
            browseKey: "workouts/browse/2026-03-17T10-00-00Z.json",
            detailKey: "workouts/detail/2026-03-17T10-00-00Z.json",
            itemCount: 1,
          },
          browse: [{ id: "cau-1234-01" }],
          detail: { "cau-1234-01": { id: "cau-1234-01" } },
        },
      }),
    });

    await worker.scheduled({} as never, { SNAPSHOTS_BUCKET: bucket }, {} as never);

    expect(bucket.writes.map((entry) => entry.key)).toEqual([
      "courses/browse/2026-03-17T10-00-00Z.json",
      "courses/detail/2026-03-17T10-00-00Z.json",
      "courses/manifest.json",
      "workouts/browse/2026-03-17T10-00-00Z.json",
      "workouts/detail/2026-03-17T10-00-00Z.json",
      "workouts/manifest.json",
    ]);
  });
});
