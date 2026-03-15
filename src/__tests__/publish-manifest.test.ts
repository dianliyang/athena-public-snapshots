import { describe, expect, test } from "vitest";
import { publishSnapshotSet, type R2BucketLike } from "../publish/publish-to-r2";

class FakeBucket implements R2BucketLike {
  public writes: Array<{ key: string; value: string }> = [];

  async put(key: string, value: string): Promise<void> {
    this.writes.push({ key, value });
  }
}

describe("publishSnapshotSet", () => {
  test("publishes browse/detail payloads before manifest", async () => {
    const bucket = new FakeBucket();

    await publishSnapshotSet(bucket, {
      baseKey: "courses",
      manifest: {
        version: "2026-03-15T12-00-00Z",
        generatedAt: "2026-03-15T12-00-00Z",
        browseKey: "courses/browse/2026-03-15T12-00-00Z.json",
        detailKey: "courses/detail/2026-03-15T12-00-00Z.json",
        itemCount: 1,
      },
      browse: [{ id: "1" }],
      detail: { "1": { id: "1" } },
    });

    expect(bucket.writes.map((entry) => entry.key)).toEqual([
      "courses/browse/2026-03-15T12-00-00Z.json",
      "courses/detail/2026-03-15T12-00-00Z.json",
      "courses/manifest.json",
    ]);
  });
});
