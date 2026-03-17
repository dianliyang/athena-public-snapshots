import { describe, expect, test } from "vitest";
import { buildPublicSnapshots } from "../pipeline/build-public-snapshots";

describe("buildPublicSnapshots", () => {
  test("builds course and workout snapshots in memory", async () => {
    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z" },
      {
        retrieveCourses: async () => [
          {
            id: "mit-6.006",
            title: "Introduction to Algorithms",
            courseCode: "6.006",
            university: "MIT",
            description: "Algorithms.",
          },
        ],
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
    expect(snapshots.courses?.manifest.browseKey).toBe("courses/browse/2026-03-17T10-00-00Z.json");
    expect(snapshots.workouts?.detail["cau-1234-01"]?.location).toEqual(["Hall 1", "Hall 2"]);
  });

  test("normalizes scraper workout schedule fields into public workout schedules", async () => {
    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z" },
      {
        retrieveCourses: async () => [],
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
    expect(snapshots.workouts?.detail["urban-apes-kiel-mon-fri"]?.description).toEqual({
      general: "No previous experience necessary",
      price: "All prices are in euros and include VAT.",
    });
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
        retrieveCourses: async () => [],
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

    const titleJson = JSON.parse(writes.get(titleKey) || "{}");
    const categoryJson = JSON.parse(writes.get(categoryKey) || "{}");

    expect(titleJson.Bowling).toEqual({
      en: "Bowling-en",
      de: "Bowling",
      ja: "Bowling-ja",
      ko: "Bowling-ko",
      "zh-CN": "Bowling-zh-CN",
    });
    expect(categoryJson["Bowling Games"]).toEqual({
      en: "Bowling Games-en",
      de: "Bowling Games",
      ja: "Bowling Games-ja",
      ko: "Bowling Games-ko",
      "zh-CN": "Bowling Games-zh-CN",
    });
  });

  test("uses the Google Translate API request shape when translationApiKey is provided", async () => {
    const writes = new Map<string, string>();
    const requests: Array<{
      url: string;
      method?: string;
      headers?: HeadersInit;
      bodyText: string;
    }> = [];
    const version = "2026-03-17T10-00-00Z";
    const titleKey = `workouts/locales/title/${version}.json`;
    const categoryKey = `workouts/locales/category/${version}.json`;

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
        retrieveCourses: async () => [],
        retrieveWorkouts: async () => [
          {
            id: "ricks-club-bowling",
            title: "Bowling",
            provider: "Ricks Club",
            category: "Bowling Games",
          },
        ],
        localeBucket: bucket,
        translationApiKey: "test-api-key",
        fetchImpl: async (input, init) => {
          requests.push({
            url: String(input),
            method: init?.method,
            headers: init?.headers,
            bodyText: init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body || ""),
          });

          const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body || ""));
          const target = body.get("target") || "";
          const text = body.get("q") || "";

          return new Response(JSON.stringify({
            data: {
              translations: [{ translatedText: `${text}-${target}` }],
            },
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );

    expect(requests).toHaveLength(8);
    expect(requests[0]?.url).toBe("https://translation.googleapis.com/language/translate/v2?key=test-api-key");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.bodyText).toContain("q=Bowling");
    expect(requests[0]?.bodyText).toContain("source=de");
    expect(requests[0]?.bodyText).toContain("format=text");
    expect(requests.map((request) => request.bodyText)).toContain("q=Bowling&source=de&target=en&format=text");
    expect(requests.map((request) => request.bodyText)).toContain("q=Bowling+Games&source=de&target=zh-CN&format=text");

    const titleJson = JSON.parse(writes.get(titleKey) || "{}");
    const categoryJson = JSON.parse(writes.get(categoryKey) || "{}");

    expect(titleJson.Bowling).toEqual({
      en: "Bowling-en",
      de: "Bowling",
      ja: "Bowling-ja",
      ko: "Bowling-ko",
      "zh-CN": "Bowling-zh-CN",
    });
    expect(categoryJson["Bowling Games"]).toEqual({
      en: "Bowling Games-en",
      de: "Bowling Games",
      ja: "Bowling Games-ja",
      ko: "Bowling Games-ko",
      "zh-CN": "Bowling Games-zh-CN",
    });
  });

  test("adds versioned locale keys to the workouts manifest", async () => {
    const version = "2026-03-17T10-00-00Z";

    const snapshots = await buildPublicSnapshots(
      { version },
      {
        retrieveCourses: async () => [],
        retrieveWorkouts: async () => [
          {
            id: "ricks-club-bowling",
            title: "Bowling",
            provider: "Ricks Club",
            category: "Bowling Games",
          },
        ],
      },
    );

    expect(snapshots.workouts?.manifest.titleLocaleKey).toBe(`workouts/locales/title/${version}.json`);
    expect(snapshots.workouts?.manifest.categoryLocaleKey).toBe(`workouts/locales/category/${version}.json`);
  });

  test("warns and continues when locale sync fails", async () => {
    const warnings: string[] = [];

    const snapshots = await buildPublicSnapshots(
      { version: "2026-03-17T10-00-00Z" },
      {
        retrieveCourses: async () => [],
        retrieveWorkouts: async () => [
          {
            id: "cau-1234-01",
            title: "Yoga",
            provider: "CAU Kiel Sportzentrum",
            category: "Mind & Body",
          },
        ],
        localeBucket: {
          async get() {
            throw new Error("r2 unavailable");
          },
          async put() {
            throw new Error("should not be called");
          },
        },
        warn: (message) => warnings.push(message),
      },
    );

    expect(snapshots.workouts?.detail["cau-1234-01"]?.title).toBe("Yoga");
    expect(warnings).toEqual([
      expect.stringContaining("Failed to sync workout locale maps"),
    ]);
  });
});
