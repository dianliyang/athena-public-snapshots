import { describe, expect, test, vi } from "vitest";
import { buildPublicSnapshots } from "../pipeline/build-public-snapshots";

describe("buildPublicSnapshots", () => {
  test("skips workout retrieval when workouts are disabled", async () => {
    const retrieveWorkouts = vi.fn(async () => [
      {
        id: "cau-1234-01",
        title: "Yoga",
        provider: "CAU Kiel Sportzentrum",
        category: "Mind & Body",
      },
    ]);

    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z", includeWorkouts: false },
      { retrieveWorkouts },
    );

    expect(retrieveWorkouts).not.toHaveBeenCalled();
    expect(snapshots.workouts).toBeUndefined();
  });

  test("uses the current workout semester when none is provided", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T12:00:00Z"));
    const retrieveWorkouts = vi.fn(async () => []);

    try {
      await buildPublicSnapshots(
        { version: "2026-03-17T10-00-00Z" },
        { retrieveWorkouts },
      );
    } finally {
      vi.useRealTimers();
    }

    expect(retrieveWorkouts).toHaveBeenCalledWith(undefined, "su26");
  });

  test("builds workout detail snapshots in memory", async () => {
    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z" },
      {
        retrieveWorkouts: async () => [
          {
            id: "cau-1234-01",
            title: "Yoga",
            provider: "CAU Kiel Sportzentrum",
            category: "Mind & Body",
            location: ["Hall 1", "Hall 2"],
          },
        ],
      },
    );

    expect(snapshots.version).toBe("2026-03-17T10-00-00Z");
    expect(snapshots.workouts?.manifest.detailKey).toBe("workouts/detail/2026-03-17T10-00-00Z.json");
    expect(snapshots.workouts?.detail["cau-1234-01"]?.location).toEqual(["Hall 1", "Hall 2"]);
  });

  test("normalizes scraper workout schedule fields into public workout schedules", async () => {
    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z" },
      {
        retrieveWorkouts: async () => [
          {
            id: "urban-apes-kiel-mon-fri",
            title: "Bouldering",
            provider: "Urban Apes",
            category: "Climbing",
            description: {
              general: "No previous experience necessary",
              price: "All prices are in euros and include VAT.",
            },
            dayOfWeek: "Mon-Fri",
            startTime: "09:00",
            endTime: "23:00",
            location: ["Grasweg 40, 24118 Kiel"],
            url: "https://www.urbanapes.de/kiel/quick-overview/",
          },
        ],
      },
    );

    expect(snapshots.workouts?.detail["urban-apes-kiel-mon-fri"]?.schedule).toEqual([
      {
        day: "Mon-Fri",
        time: "09:00-23:00",
        location: "Grasweg 40, 24118 Kiel",
      },
    ]);
  });

  test("appends missing workout titles and categories to locale json in r2 with translated locales", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-17T10-00-00Z";
    const titleKey = `workouts/locales/title/${version}.json`;
    const categoryKey = `workouts/locales/category/${version}.json`;
    const bucket = {
      async get(key: string) {
        const objects: Record<string, string> = {
          [titleKey]: JSON.stringify({
            ExistingTitle: {
              en: "ExistingTitle",
              de: "ExistingTitle",
              ja: "",
              ko: "",
              "zh-CN": "",
            },
          }),
          [categoryKey]: JSON.stringify({
            ExistingCategory: {
              en: "ExistingCategory",
              de: "ExistingCategory",
              ja: "",
              ko: "",
              "zh-CN": "",
            },
          }),
        };

        const value = objects[key];
        return value ? { text: async () => value } : null;
      },
      async put(key: string, value: string) {
        writes.set(key, value);
      },
    };

    await buildPublicSnapshots(
      { version },
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

    expect(JSON.parse(writes.get(titleKey) || "{}").Bowling).toEqual({
      en: "Bowling-en",
      de: "Bowling",
      ja: "Bowling-ja",
      ko: "Bowling-ko",
      "zh-CN": "Bowling-zh-CN",
    });
    expect(JSON.parse(writes.get(categoryKey) || "{}")["Bowling Games"]).toEqual({
      en: "Bowling Games-en",
      de: "Bowling Games",
      ja: "Bowling Games-ja",
      ko: "Bowling Games-ko",
      "zh-CN": "Bowling Games-zh-CN",
    });
  });

  test("seeds new locale files from the previous manifest locale keys before appending", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-21T10-00-00Z";
    const previousCategoryKey = "workouts/locales/category/2026-03-20T10-00-00Z.json";
    const nextCategoryKey = `workouts/locales/category/${version}.json`;

    const bucket = {
      async get(key: string) {
        const objects: Record<string, string> = {
          [previousCategoryKey]: JSON.stringify({
            "Bowling Games": {
              en: "Bowling Games-en",
              de: "Bowling Games",
              ja: "Bowling Games-ja",
              ko: "Bowling Games-ko",
              "zh-CN": "Bowling Games-zh-CN",
            },
            "Climbing Session": {
              en: "Climbing Session-en",
              de: "Climbing Session",
              ja: "Climbing Session-ja",
              ko: "Climbing Session-ko",
              "zh-CN": "Climbing Session-zh-CN",
            },
          }),
        };

        const value = objects[key];
        return value ? { text: async () => value } : null;
      },
      async put(key: string, value: string) {
        writes.set(key, value);
      },
    };

    await buildPublicSnapshots(
      { version },
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
        seedWorkoutLocaleKeys: {
          categoryLocaleKey: previousCategoryKey,
        },
      },
    );

    expect(JSON.parse(writes.get(nextCategoryKey) || "{}")).toMatchObject({
      "Bowling Games": {
        de: "Bowling Games",
      },
      "Climbing Session": {
        de: "Climbing Session",
      },
    });
  });
});
