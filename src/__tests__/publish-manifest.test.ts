import { describe, expect, test } from "vitest";
import { publishSnapshotSet, type R2BucketLike } from "../publish/publish-to-r2";

class FakeBucket implements R2BucketLike {
  public writes: Array<{ key: string; value: string }> = [];
  public deletes: string[] = [];
  public listResponses = new Map<string, string[]>();

  async put(key: string, value: string): Promise<void> {
    this.writes.push({ key, value });
  }

  async list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }> {
    const keys = this.listResponses.get(options?.prefix || "") || [];
    return {
      objects: keys.map((key) => ({ key })),
    };
  }

  async delete(keys: string | string[]): Promise<void> {
    this.deletes.push(...(Array.isArray(keys) ? keys : [keys]));
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

  test("keeps only the latest 3 workout snapshot versions and preserves locale keys in the manifest", async () => {
    const bucket = new FakeBucket();
    bucket.listResponses.set("workouts/browse/", [
      "workouts/browse/2026-03-12T12-00-00Z.json",
      "workouts/browse/2026-03-13T12-00-00Z.json",
      "workouts/browse/2026-03-14T12-00-00Z.json",
      "workouts/browse/2026-03-15T12-00-00Z.json",
    ]);
    bucket.listResponses.set("workouts/detail/", [
      "workouts/detail/2026-03-12T12-00-00Z.json",
      "workouts/detail/2026-03-13T12-00-00Z.json",
      "workouts/detail/2026-03-14T12-00-00Z.json",
      "workouts/detail/2026-03-15T12-00-00Z.json",
    ]);
    bucket.listResponses.set("workouts/locales/title/", [
      "workouts/locales/title/2026-03-12T12-00-00Z.json",
      "workouts/locales/title/2026-03-13T12-00-00Z.json",
      "workouts/locales/title/2026-03-14T12-00-00Z.json",
      "workouts/locales/title/2026-03-15T12-00-00Z.json",
    ]);
    bucket.listResponses.set("workouts/locales/category/", [
      "workouts/locales/category/2026-03-12T12-00-00Z.json",
      "workouts/locales/category/2026-03-13T12-00-00Z.json",
      "workouts/locales/category/2026-03-14T12-00-00Z.json",
      "workouts/locales/category/2026-03-15T12-00-00Z.json",
    ]);

    await publishSnapshotSet(bucket, {
      baseKey: "workouts",
      manifest: {
        version: "2026-03-15T12-00-00Z",
        generatedAt: "2026-03-15T12-00-00Z",
        browseKey: "workouts/browse/2026-03-15T12-00-00Z.json",
        detailKey: "workouts/detail/2026-03-15T12-00-00Z.json",
        titleLocaleKey: "workouts/locales/title/2026-03-15T12-00-00Z.json",
        categoryLocaleKey: "workouts/locales/category/2026-03-15T12-00-00Z.json",
        itemCount: 1,
      },
      browse: [{ id: "1" }],
      detail: { "1": { id: "1" } },
    });

    expect(bucket.deletes).toEqual([
      "workouts/browse/2026-03-12T12-00-00Z.json",
      "workouts/detail/2026-03-12T12-00-00Z.json",
      "workouts/locales/title/2026-03-12T12-00-00Z.json",
      "workouts/locales/category/2026-03-12T12-00-00Z.json",
    ]);

    expect(JSON.parse(bucket.writes[2]?.value || "{}")).toMatchObject({
      titleLocaleKey: "workouts/locales/title/2026-03-15T12-00-00Z.json",
      categoryLocaleKey: "workouts/locales/category/2026-03-15T12-00-00Z.json",
    });
  });
});
