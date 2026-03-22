import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PublicSnapshots } from "../pipeline/build-public-snapshots";
import { createWorker } from "../worker";
import type { R2BucketLike } from "../publish/publish-to-r2";
import { RAW_WORKOUTS_LATEST_KEY } from "../pipeline/retrieve-raw-workouts";

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
    bucket.reads.set(RAW_WORKOUTS_LATEST_KEY, JSON.stringify({
      version: "2026-03-17T10-00-00Z",
      generatedAt: "2026-03-17T10:00:00Z",
      semester: "su26",
      workouts: [
        {
          id: "cau-1234-01",
          title: "Yoga",
          provider: "CAU Kiel Sportzentrum",
          category: "Mind & Body",
        },
      ],
    }));
    buildPublicSnapshotsMock.mockResolvedValue({
      version: "2026-03-17T10-00-00Z",
      workouts: {
        manifest: {
          version: "2026-03-17T10-00-00Z",
          generatedAt: "2026-03-17T10-00-00Z",
          detailKey: "workouts/detail/2026-03-17T10-00-00Z.json",
          itemCount: 1,
        },
        detail: { "cau-1234-01": { id: "cau-1234-01" } },
      },
    });
    const worker = createWorker();

    await expect(
      worker.scheduled({} as never, { SNAPSHOTS_BUCKET: bucket } as never, {} as never),
    ).resolves.toBeUndefined();

    expect(bucket.writes.map((entry) => entry.key)).toEqual([
      "workouts/detail/2026-03-17T10-00-00Z.json",
      "workouts/manifest.json",
    ]);

    expect(buildPublicSnapshotsMock).toHaveBeenCalledWith(
      { version: "2026-03-17T10-00-00Z" },
      expect.objectContaining({
        localeBucket: bucket,
        translationApiKey: undefined,
        retrieveWorkouts: expect.any(Function),
      }),
    );

    const deps = buildPublicSnapshotsMock.mock.calls[0]?.[1];
    await expect(deps?.retrieveWorkouts?.()).resolves.toEqual([
      {
        id: "cau-1234-01",
        title: "Yoga",
        provider: "CAU Kiel Sportzentrum",
        category: "Mind & Body",
      },
    ]);
  });

  test("fails the scheduled build when the raw workouts payload is missing", async () => {
    const bucket = new FakeBucket();
    const worker = createWorker();

    await expect(
      worker.scheduled({} as never, { SNAPSHOTS_BUCKET: bucket } as never, {} as never),
    ).rejects.toThrow(`Missing raw workouts payload at ${RAW_WORKOUTS_LATEST_KEY}`);

    expect(buildPublicSnapshotsMock).not.toHaveBeenCalled();
  });

  test("publishes workout detail snapshots to R2", async () => {
    const bucket = new FakeBucket();
    const worker = createWorker({
      buildPublicSnapshots: async () => ({
        version: "2026-03-17T10-00-00Z",
        workouts: {
          manifest: {
            version: "2026-03-17T10-00-00Z",
            generatedAt: "2026-03-17T10-00-00Z",
            detailKey: "workouts/detail/2026-03-17T10-00-00Z.json",
            itemCount: 1,
          },
          detail: { "cau-1234-01": { id: "cau-1234-01" } },
        },
      }),
    });

    await worker.scheduled({} as never, { SNAPSHOTS_BUCKET: bucket }, {} as never);

    expect(bucket.writes.map((entry) => entry.key)).toEqual([
      "workouts/detail/2026-03-17T10-00-00Z.json",
      "workouts/manifest.json",
    ]);
  });

  test("serves published workout snapshot files over fetch", async () => {
    const bucket = new FakeBucket();
    bucket.reads.set("workouts/manifest.json", JSON.stringify({
      version: "2026-03-17T10-00-00Z",
      generatedAt: "2026-03-17T10-00-00Z",
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
