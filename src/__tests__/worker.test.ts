import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PublicSnapshots } from "../pipeline/build-public-snapshots";
import { createWorker } from "../worker";
import type { R2BucketLike } from "../publish/publish-to-r2";

const { buildPublicSnapshotsMock } = vi.hoisted(() => ({
  buildPublicSnapshotsMock: vi.fn<[], Promise<PublicSnapshots>>(),
}));

vi.mock("../pipeline/build-public-snapshots", () => ({
  buildPublicSnapshots: buildPublicSnapshotsMock,
}));

class FakeBucket implements R2BucketLike {
  public writes: Array<{ key: string; value: string }> = [];
  public reads = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.writes.push({ key, value });
  }

  async get(key: string): Promise<{ text(): Promise<string> } | null> {
    const value = this.reads.get(key);
    if (value === undefined) {
      return null;
    }

    return {
      async text() {
        return value;
      },
    };
  }
}

describe("worker scheduled publish", () => {
  beforeEach(() => {
    buildPublicSnapshotsMock.mockReset();
  });

  test("does not require GOOGLE_TRANSLATE_API_KEY for the default scheduled snapshot build", async () => {
    const bucket = new FakeBucket();
    buildPublicSnapshotsMock.mockResolvedValue({
      version: "2026-03-17T10-00-00Z",
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
    });
    const worker = createWorker();

    await expect(
      worker.scheduled({} as never, { SNAPSHOTS_BUCKET: bucket } as never, {} as never),
    ).resolves.toBeUndefined();

    expect(bucket.writes.map((entry) => entry.key)).toEqual([
      "workouts/browse/2026-03-17T10-00-00Z.json",
      "workouts/detail/2026-03-17T10-00-00Z.json",
      "workouts/manifest.json",
    ]);

    expect(buildPublicSnapshotsMock).toHaveBeenCalledWith(
      { includeCourses: false },
      {
        localeBucket: bucket,
        translationApiKey: undefined,
      },
    );
  });

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

  test("serves published workout snapshot files over fetch", async () => {
    const bucket = new FakeBucket();
    bucket.reads.set("workouts/manifest.json", JSON.stringify({
      version: "2026-03-17T10-00-00Z",
      generatedAt: "2026-03-17T10-00-00Z",
      browseKey: "workouts/browse/2026-03-17T10-00-00Z.json",
      detailKey: "workouts/detail/2026-03-17T10-00-00Z.json",
      itemCount: 1,
    }));
    bucket.reads.set(
      "workouts/detail/2026-03-17T10-00-00Z.json",
      JSON.stringify({ "demo-workout": { id: "demo-workout" } }),
    );

    const worker = createWorker();

    const manifestResponse = await worker.fetch(
      new Request("https://athena-public-snapshots.oili.workers.dev/workouts/manifest.json"),
      { SNAPSHOTS_BUCKET: bucket } as never,
      {} as never,
    );
    const detailResponse = await worker.fetch(
      new Request("https://athena-public-snapshots.oili.workers.dev/workouts/detail/2026-03-17T10-00-00Z.json"),
      { SNAPSHOTS_BUCKET: bucket } as never,
      {} as never,
    );

    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers.get("content-type")).toContain("application/json");
    expect(await manifestResponse.json()).toMatchObject({
      detailKey: "workouts/detail/2026-03-17T10-00-00Z.json",
    });

    expect(detailResponse.status).toBe(200);
    expect(await detailResponse.json()).toEqual({
      "demo-workout": { id: "demo-workout" },
    });
  });
});
