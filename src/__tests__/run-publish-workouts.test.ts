import { describe, expect, test, vi } from "vitest";

const buildPublicSnapshots = vi.fn();
const createWranglerR2Bucket = vi.fn();
const retrievePublishedWorkoutSnapshot = vi.fn();
const publishSnapshotSet = vi.fn();
const writeLocalWorkoutOutput = vi.fn();
const writeLocalWorkoutLocales = vi.fn();
const mergeTargetedWorkoutRefresh = vi.fn((target, published, detail, manifest) => ({
  detail,
  manifest,
}));
const loadLocalEnv = vi.fn();

vi.mock("../pipeline/build-public-snapshots", () => ({
  buildPublicSnapshots,
}));

vi.mock("../local/wrangler-r2-bucket", () => ({
  createWranglerR2Bucket,
}));

vi.mock("../pipeline/retrieve-published-workout-details", () => ({
  retrievePublishedWorkoutSnapshot,
}));

vi.mock("../publish/publish-to-r2", () => ({
  publishSnapshotSet,
}));

vi.mock("../local/write-local-workout-output", () => ({
  writeLocalWorkoutOutput,
}));

vi.mock("../local/write-local-workout-locales", () => ({
  writeLocalWorkoutLocales,
}));

vi.mock("../pipeline/merge-targeted-workout-refresh", () => ({
  mergeTargetedWorkoutRefresh,
}));

vi.mock("../local/load-local-env", () => ({
  loadLocalEnv,
}));

describe("runPublishWorkouts", () => {
  test("local-only mode writes local outputs without publishing to R2", async () => {
    const bucket = { get: vi.fn() };
    createWranglerR2Bucket.mockReturnValue(bucket);
    retrievePublishedWorkoutSnapshot.mockResolvedValue({
      manifest: {
        titleLocaleKey: "workouts/locales/title/prev.json",
        categoryLocaleKey: "workouts/locales/category/prev.json",
        metadataLocaleKey: "workouts/locales/metadata/prev.json",
        wikipediaLocaleKey: "workouts/locales/wikipedia/prev.json",
      },
      workouts: [],
    });
    buildPublicSnapshots.mockResolvedValue({
      workouts: {
        manifest: {
          version: "2026-03-22T16-00-00Z",
          generatedAt: "2026-03-22T16-00-00Z",
          detailKey: "workouts/detail/2026-03-22T16-00-00Z.json",
          itemCount: 1,
          titleLocaleKey: "workouts/locales/title/2026-03-22T16-00-00Z.json",
          categoryLocaleKey: "workouts/locales/category/2026-03-22T16-00-00Z.json",
          metadataLocaleKey: "workouts/locales/metadata/2026-03-22T16-00-00Z.json",
          wikipediaLocaleKey: "workouts/locales/wikipedia/2026-03-22T16-00-00Z.json",
        },
        detail: {
          demo: {
            id: "demo",
            slug: "demo",
            title: "Demo",
            provider: "CAU Kiel Sportzentrum",
            category: "Yoga",
            schedule: [],
            location: null,
            url: null,
          },
        },
      },
    });

    const { runPublishWorkouts } = await import("../run-publish-workouts");

    await runPublishWorkouts(["--mode=refresh", "--target=cau-sport", "--local-only"]);

    expect(writeLocalWorkoutOutput).toHaveBeenCalledTimes(1);
    expect(writeLocalWorkoutLocales).toHaveBeenCalledTimes(1);
    expect(publishSnapshotSet).not.toHaveBeenCalled();
  });

  test("local-only mode passes the isolated locale bucket to the local locale writer", async () => {
    const baseBucket = {
      get: vi.fn(async () => null),
    };
    createWranglerR2Bucket.mockReturnValue(baseBucket);
    retrievePublishedWorkoutSnapshot.mockResolvedValue({
      manifest: {
        titleLocaleKey: "workouts/locales/title/prev.json",
        categoryLocaleKey: "workouts/locales/category/prev.json",
        metadataLocaleKey: "workouts/locales/metadata/prev.json",
        wikipediaLocaleKey: "workouts/locales/wikipedia/prev.json",
      },
      workouts: [],
    });

    buildPublicSnapshots.mockImplementation(async (_options, deps) => {
      await deps.localeBucket.put(
        "workouts/locales/metadata/2026-03-22T16-00-00Z.json",
        JSON.stringify({ pages: {}, entries: { demo: { notes: { digest: "d41d8cd98f00b204e9800998ecf8427e", de: "", en: "", ja: "", ko: "", "zh-CN": "" } } } }),
      );

      return {
        workouts: {
          manifest: {
            version: "2026-03-22T16-00-00Z",
            generatedAt: "2026-03-22T16-00-00Z",
            detailKey: "workouts/detail/2026-03-22T16-00-00Z.json",
            itemCount: 1,
            titleLocaleKey: undefined,
            categoryLocaleKey: undefined,
            metadataLocaleKey: "workouts/locales/metadata/2026-03-22T16-00-00Z.json",
            wikipediaLocaleKey: undefined,
          },
          detail: {
            demo: {
              id: "demo",
              slug: "demo",
              title: "Demo",
              provider: "CAU Kiel Sportzentrum",
              category: "Yoga",
              schedule: [],
              location: null,
              url: null,
            },
          },
        },
      };
    });

    const { runPublishWorkouts } = await import("../run-publish-workouts");

    await runPublishWorkouts(["--mode=refresh", "--target=cau-sport", "--local-only"]);

    const localeBucketArg = writeLocalWorkoutLocales.mock.calls.at(-1)?.[1];
    const metadataObject = await localeBucketArg.get("workouts/locales/metadata/2026-03-22T16-00-00Z.json");

    expect(await metadataObject?.text()).toBe(JSON.stringify({ pages: {}, entries: { demo: { notes: { digest: "d41d8cd98f00b204e9800998ecf8427e", de: "", en: "", ja: "", ko: "", "zh-CN": "" } } } }));
  });
});
