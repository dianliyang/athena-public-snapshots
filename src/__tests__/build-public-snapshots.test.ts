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

  test("appends missing workout titles and categories to locale json in r2 with translated locales when enabled", async () => {
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

  test("preserves existing locale entries when seeded locale keys conflict", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-00-00Z";
    const previousTitleKey = "workouts/locales/title/2026-03-21T10-00-00Z.json";
    const previousWikipediaKey = "workouts/locales/wikipedia/2026-03-21T10-00-00Z.json";
    const nextTitleKey = `workouts/locales/title/${version}.json`;
    const nextWikipediaKey = `workouts/locales/wikipedia/${version}.json`;

    const bucket = {
      async get(key: string) {
        const objects: Record<string, string> = {
          [previousTitleKey]: JSON.stringify({
            Bowling: {
              en: "Old Bowling Title",
              de: "Old Bowling",
              ja: "Old Bowling-ja",
              ko: "Old Bowling-ko",
              "zh-CN": "Old Bowling-zh-CN",
            },
          }),
          [previousWikipediaKey]: JSON.stringify({
            "Bowling Games": {
              en: "Old wiki title",
              de: "Old Bowling Wiki",
              ja: "Old wiki-ja",
              ko: "Old wiki-ko",
              "zh-CN": "Old wiki-zh-CN",
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
          titleLocaleKey: previousTitleKey,
          wikipediaLocaleKey: previousWikipediaKey,
        },
      },
    );

    expect(JSON.parse(writes.get(nextTitleKey) || "{}").Bowling).toEqual({
      en: "Old Bowling Title",
      de: "Old Bowling",
      ja: "Old Bowling-ja",
      ko: "Old Bowling-ko",
      "zh-CN": "Old Bowling-zh-CN",
    });
    expect(JSON.parse(writes.get(nextWikipediaKey) || "{}")["Bowling Games"]).toEqual({
      en: "Old wiki title",
      de: "Old Bowling Wiki",
      ja: "Old wiki-ja",
      ko: "Old wiki-ko",
      "zh-CN": "Old wiki-zh-CN",
    });
  });

  test("reuses current locale entries and only translates missing ones when enabled", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-30-00Z";
    const titleKey = `workouts/locales/title/${version}.json`;
    const metadataKey = `workouts/locales/metadata/${version}.json`;
    const translateText = vi.fn(async (text: string, target: string) => `${text}-${target}`);

    const bucket = {
      async get(key: string) {
        const objects: Record<string, string> = {
          [titleKey]: JSON.stringify({
            Bowling: {
              en: "Bowling-en-existing",
              de: "Bowling",
              ja: "Bowling-ja-existing",
              ko: "Bowling-ko-existing",
              "zh-CN": "Bowling-zh-CN-existing",
            },
          }),
          [metadataKey]: JSON.stringify({
            page: {},
            entries: {
              "ricks-club-bowling": {
                description: {
                  general: {
                    digest: "29d463f788ca1238d915a6c244d473d2",
                    en: "Family-friendly bowling lanes-en-existing",
                    de: "Family-friendly bowling lanes",
                    ja: "Family-friendly bowling lanes-ja-existing",
                    ko: "Family-friendly bowling lanes-ko-existing",
                    "zh-CN": "Family-friendly bowling lanes-zh-CN-existing",
                  },
                },
              },
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
            description: {
              general: "Family-friendly bowling lanes",
            },
          },
        ],
        localeBucket: bucket,
        translateText,
      },
    );

    expect(translateText).toHaveBeenCalledTimes(4);
    expect(translateText).toHaveBeenCalledWith("Bowling Games", "en");
    expect(writes.has(titleKey)).toBe(false);
    expect(writes.has(metadataKey)).toBe(false);
  });

  test("rebuilds metadata translations when the source text digest changes", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-35-00Z";
    const metadataKey = `workouts/locales/metadata/${version}.json`;
    const translateText = vi.fn(async (text: string, target: string) => `${text}-${target}`);

    const bucket = {
      async get(key: string) {
        const objects: Record<string, string> = {
          [metadataKey]: JSON.stringify({
            page: {},
            entries: {
              "existing-workout": {
                description: {
                  general: {
                    digest: "d062e0e8e2ec43175c539d2a947e7e7e",
                    en: "Student price: EUR 135.00",
                    de: "Preis für Studierende: 135,00 EUR",
                    ja: "学生料金: 135.00ユーロ",
                    ko: "학생 가격: 135.00유로",
                    "zh-CN": "学生价格：135.00欧元",
                  },
                },
              },
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
            id: "haw-kiel-123",
            title: "Windsurfen",
            provider: "HAW Kiel Hochschulsport",
            category: "Windsurfen",
            description: {
              general: "preis fur studierende 13500 eur",
            },
          },
        ],
        localeBucket: bucket,
        translateText,
      },
    );

    expect(translateText).toHaveBeenCalledTimes(12);
    expect(translateText).toHaveBeenCalledWith("preis fur studierende 13500 eur", "en");
    expect(JSON.parse(writes.get(metadataKey) || "{}")).toEqual({
      page: {},
      entries: {
        "haw-kiel-123": {
          general: {
            digest: "c22d061e4e60d0577eb4d5f849fe4ef1",
            en: "preis fur studierende 13500 eur-en",
            de: "preis fur studierende 13500 eur",
            ja: "preis fur studierende 13500 eur-ja",
            ko: "preis fur studierende 13500 eur-ko",
            "zh-CN": "preis fur studierende 13500 eur-zh-CN",
          },
        },
      },
    });
  });

  test("translates metadata from the de field while storing an md5 digest", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-40-00Z";
    const metadataKey = `workouts/locales/metadata/${version}.json`;
    const translateText = vi.fn(async (text: string, target: string) => `${text}-${target}`);

    const bucket = {
      async get() {
        return null;
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
            id: "haw-kiel-456",
            title: "Windsurfen",
            provider: "HAW Kiel Hochschulsport",
            category: "Windsurfen",
            description: {
              general: "Preis für Studierende: 135,00 EUR",
            },
          },
        ],
        localeBucket: bucket,
        translateText,
      },
    );

    expect(translateText).toHaveBeenCalledWith("Preis für Studierende: 135,00 EUR", "en");
    expect(JSON.parse(writes.get(metadataKey) || "{}")).toEqual({
      page: {},
      entries: {
        "haw-kiel-456": {
          general: {
            digest: "d062e0e8e2ec43175c539d2a947e7e7e",
            en: "Preis für Studierende: 135,00 EUR-en",
            de: "Preis für Studierende: 135,00 EUR",
            ja: "Preis für Studierende: 135,00 EUR-ja",
            ko: "Preis für Studierende: 135,00 EUR-ko",
            "zh-CN": "Preis für Studierende: 135,00 EUR-zh-CN",
          },
        },
      },
    });
  });

  test("keeps description text out of workout detail snapshots while writing it to metadata locales", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-41-00Z";
    const metadataKey = `workouts/locales/metadata/${version}.json`;

    const snapshots = await buildPublicSnapshots(
      { version },
      {
        retrieveWorkouts: async () => [
          {
            id: "haw-kiel-789",
            title: "Yin Yoga",
            provider: "HAW Kiel Hochschulsport",
            category: "Yoga",
            description: {
              general: "Sanfter Kurs fuer alle Levels.",
              price: "Preis für Studierende: 50,00 €",
            },
          },
        ],
        localeBucket: {
          async get() {
            return null;
          },
          async put(key: string, value: string) {
            writes.set(key, value);
          },
        },
      },
    );

    expect(snapshots.workouts?.detail["haw-kiel-789"]).not.toHaveProperty("description");
    expect(JSON.parse(writes.get(metadataKey) || "{}")).toEqual({
      page: {},
      entries: {
        "haw-kiel-789": {
          general: {
            digest: "48da7a91daa88d05ab6dcafcbb78248b",
            en: "",
            de: "Sanfter Kurs fuer alle Levels.",
            ja: "",
            ko: "",
            "zh-CN": "",
          },
          price: {
            digest: "b15ca5690187c821488aa37929422174",
            en: "",
            de: "Preis für Studierende: 50,00 €",
            ja: "",
            ko: "",
            "zh-CN": "",
          },
        },
      },
    });
  });

  test("writes CAU description notes as one joined object per normalized category key without translation", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-42-00Z";
    const metadataKey = `workouts/locales/metadata/${version}.json`;
    const translateText = vi.fn(async (text: string, target: string) => `${text}-${target}`);
    const cauPageUrl = "https://server.sportzentrum.uni-kiel.de/angebote/aktueller_zeitraum/_Yoga__Aerial_Yoga.html";
    const cauMetadataKey = "cau_yoga_aerial_yoga";

    const snapshots = await buildPublicSnapshots(
      { version },
      {
        retrieveWorkouts: async () => [
          {
            id: "cau-1234-58",
            title: "Lunch Flow",
            provider: "CAU Kiel Sportzentrum",
            category: "  Yoga, Aerial Yoga  ",
            url: cauPageUrl,
            description: {
              notes: [
                "Bitte eigene Matte mitbringen.",
                "Der Kurs startet erst ab 10 Teilnehmenden.",
              ],
            },
          },
          {
            id: "cau-1234-59",
            title: "Evening Flow",
            provider: "CAU Kiel Sportzentrum",
            category: "Yoga, Aerial Yoga",
            url: cauPageUrl,
            description: {
              notes: [
                "Bitte eigene Matte mitbringen.",
                "Der Kurs startet erst ab 10 Teilnehmenden.",
              ],
            },
          },
        ],
        localeBucket: {
          async get() {
            return null;
          },
          async put(key: string, value: string) {
            writes.set(key, value);
          },
        },
        translateText,
      },
    );

    expect(snapshots.workouts?.detail["cau-1234-58"]).not.toHaveProperty("description");
    expect(snapshots.workouts?.detail["cau-1234-59"]).not.toHaveProperty("description");
    expect(translateText).not.toHaveBeenCalledWith("Bitte eigene Matte mitbringen.", "en");
    expect(JSON.parse(writes.get(metadataKey) || "{}")).toEqual({
      page: {
        [cauMetadataKey]: {
          "CAU Kiel Sportzentrum": {
            notes: {
              digest: "839f3b1a9a184653dbedd17ee2b83108",
              de: "Bitte eigene Matte mitbringen.\n\nDer Kurs startet erst ab 10 Teilnehmenden.",
              en: "",
              ja: "",
              ko: "",
              "zh-CN": "",
            },
          },
        },
      },
      entries: {},
    });
  });

  test("keeps CAU workouts with duplicate course codes in different categories as separate detail entries", async () => {
    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-22T12-43-00Z" },
      {
        retrieveWorkouts: async () => [
          {
            source: "CAU Kiel Sportzentrum",
            courseCode: "5170-01",
            title: "Afro Dance",
            provider: "CAU Kiel Sportzentrum",
            category: "Afro Dance",
            dayOfWeek: "Fr",
            startTime: "16:00",
            endTime: "17:00",
            location: ["Gymnastikhalle"],
            url: "https://server.sportzentrum.uni-kiel.de/angebote/aktueller_zeitraum/_Afro_Dance.html",
          },
          {
            source: "CAU Kiel Sportzentrum",
            courseCode: "5170-01",
            title: "Forró",
            provider: "CAU Kiel Sportzentrum",
            category: "Forró",
            dayOfWeek: "Mo",
            startTime: "19:00",
            endTime: "20:15",
            location: ["Entspannungshalle oben"],
            url: "https://server.sportzentrum.uni-kiel.de/angebote/aktueller_zeitraum/_Forr_.html",
          },
        ],
      },
    );

    expect(snapshots.workouts?.detail).toMatchObject({
      "cau-kiel-sportzentrum-afro-dance-5170-01": {
        title: "Afro Dance",
        category: "Afro Dance",
      },
      "cau-kiel-sportzentrum-forr-5170-01": {
        title: "Forró",
        category: "Forró",
      },
    });
    expect(Object.keys(snapshots.workouts?.detail || {})).toHaveLength(2);
  });

  test("keeps new locale entries untranslated when translation is disabled", async () => {
    const writes = new Map<string, string>();
    const version = "2026-03-22T12-45-00Z";
    const titleKey = `workouts/locales/title/${version}.json`;

    const bucket = {
      async get() {
        return null;
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
      },
    );

    expect(JSON.parse(writes.get(titleKey) || "{}").Bowling).toEqual({
      en: "",
      de: "Bowling",
      ja: "",
      ko: "",
      "zh-CN": "",
    });
  });
});
