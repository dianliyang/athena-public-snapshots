import { afterEach, describe, expect, test } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createLocalSnapshotBucket } from "../local/local-snapshot-bucket";
import { buildPublicSnapshots } from "../pipeline/build-public-snapshots";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("createLocalSnapshotBucket", () => {
  test("persists locale files on disk for local snapshot builds", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "athena-local-bucket-"));
    tempDirs.push(rootDir);
    const bucket = createLocalSnapshotBucket(rootDir);
    const version = "2026-03-17T10-00-00Z";

    const snapshots = await buildPublicSnapshots(
      { version, includeCourses: false },
      {
        retrieveWorkouts: async () => [
          {
            id: "ricks-club-bowling",
            title: "Bowling",
            provider: "Ricks Club",
            category: "Bowling Games",
          },
        ],
        localeBucket: bucket,
        translateText: async (text, target) => `${text}-${target}`,
      },
    );

    const titleLocalePath = path.join(rootDir, "workouts/locales/title", `${version}.json`);
    const categoryLocalePath = path.join(rootDir, "workouts/locales/category", `${version}.json`);

    expect(snapshots.workouts?.manifest.titleLocaleKey).toBe(`workouts/locales/title/${version}.json`);
    expect(snapshots.workouts?.manifest.categoryLocaleKey).toBe(`workouts/locales/category/${version}.json`);
    expect(JSON.parse(fs.readFileSync(titleLocalePath, "utf8")).Bowling).toEqual({
      en: "Bowling-en",
      de: "Bowling",
      ja: "Bowling-ja",
      ko: "Bowling-ko",
      "zh-CN": "Bowling-zh-CN",
    });
    expect(JSON.parse(fs.readFileSync(categoryLocalePath, "utf8"))["Bowling Games"]).toEqual({
      en: "Bowling Games-en",
      de: "Bowling Games",
      ja: "Bowling Games-ja",
      ko: "Bowling Games-ko",
      "zh-CN": "Bowling Games-zh-CN",
    });
  });

  test("reads and updates legacy local locale files", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "athena-local-bucket-"));
    tempDirs.push(rootDir);
    const bucket = createLocalSnapshotBucket(rootDir);
    const version = "2026-03-17T10-00-00Z";

    fs.writeFileSync(
      path.join(rootDir, "workout-title-locale.json"),
      JSON.stringify({
        ExistingTitle: {
          en: "ExistingTitle",
          de: "ExistingTitle",
          ja: "",
          ko: "",
          "zh-CN": "",
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(rootDir, "workout-category-locale.json"),
      JSON.stringify({
        ExistingCategory: {
          en: "ExistingCategory",
          de: "ExistingCategory",
          ja: "",
          ko: "",
          "zh-CN": "",
        },
      }),
      "utf8",
    );

    await buildPublicSnapshots(
      { version, includeCourses: false },
      {
        retrieveWorkouts: async () => [
          {
            id: "ricks-club-bowling",
            title: "Bowling",
            provider: "Ricks Club",
            category: "Bowling Games",
          },
        ],
        localeBucket: bucket,
        translateText: async (text, target) => `${text}-${target}`,
      },
    );

    const legacyTitleJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, "workout-title-locale.json"), "utf8"),
    );
    const legacyCategoryJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, "workout-category-locale.json"), "utf8"),
    );

    expect(legacyTitleJson.ExistingTitle).toBeDefined();
    expect(legacyTitleJson.Bowling).toEqual({
      en: "Bowling-en",
      de: "Bowling",
      ja: "Bowling-ja",
      ko: "Bowling-ko",
      "zh-CN": "Bowling-zh-CN",
    });
    expect(legacyCategoryJson.ExistingCategory).toBeDefined();
    expect(legacyCategoryJson["Bowling Games"]).toEqual({
      en: "Bowling Games-en",
      de: "Bowling Games",
      ja: "Bowling Games-ja",
      ko: "Bowling Games-ko",
      "zh-CN": "Bowling Games-zh-CN",
    });
  });
});
