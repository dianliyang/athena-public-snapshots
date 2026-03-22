import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { writeLocalWorkoutLocales } from "../local/write-local-workout-locales";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("writeLocalWorkoutLocales", () => {
  test("writes locale files under out/workouts and legacy title/category files", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "athena-local-locales-"));
    tempDirs.push(rootDir);

    const objects = new Map<string, string>([
      [
        "workouts/locales/title/2026-03-22T12-01-29-056Z.json",
        JSON.stringify({ Bowling: { de: "Bowling", en: "" } }, null, 2),
      ],
      [
        "workouts/locales/category/2026-03-22T12-01-29-056Z.json",
        JSON.stringify({ Fitness: { de: "Fitness", en: "" } }, null, 2),
      ],
      [
        "workouts/locales/wikipedia/2026-03-22T12-01-29-056Z.json",
        JSON.stringify({ "demo-id": { de: "Bowling", en: "" } }, null, 2),
      ],
    ]);

    await writeLocalWorkoutLocales(
      rootDir,
      {
        async get(key: string) {
          const value = objects.get(key);
          return value ? { text: async () => value } : null;
        },
      },
      {
        titleLocaleKey: "workouts/locales/title/2026-03-22T12-01-29-056Z.json",
        categoryLocaleKey: "workouts/locales/category/2026-03-22T12-01-29-056Z.json",
        metadataLocaleKey: undefined,
        wikipediaLocaleKey: "workouts/locales/wikipedia/2026-03-22T12-01-29-056Z.json",
      },
    );

    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(rootDir, "workouts/locales/title/2026-03-22T12-01-29-056Z.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      Bowling: { de: "Bowling", en: "" },
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(rootDir, "workout-title-locale.json"), "utf8")),
    ).toEqual({
      Bowling: { de: "Bowling", en: "" },
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(rootDir, "workouts/locales/wikipedia/2026-03-22T12-01-29-056Z.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      "demo-id": { de: "Bowling", en: "" },
    });
  });
});
