import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { writeLocalWorkoutOutput } from "../local/write-local-workout-output";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("writeLocalWorkoutOutput", () => {
  test("writes detail and manifest files to the out directory", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "athena-local-output-"));
    tempDirs.push(rootDir);

    writeLocalWorkoutOutput(rootDir, {
      manifest: {
        version: "2026-03-22T11-40-34-933Z",
        generatedAt: "2026-03-22T11-40-34-933Z",
        detailKey: "workouts/detail/2026-03-22T11-40-34-933Z.json",
        itemCount: 1,
      },
      detail: {
        "haw-kiel-120": {
          id: "haw-kiel-120",
          slug: "tischfussball",
          title: "Tischfußball",
          provider: "HAW Kiel Hochschulsport",
          category: "Ballsportarten",
          description: {
            general: "Offenes Spielangebot",
          },
          schedule: [],
          location: ["Campus Center Kiel"],
          url: "https://haw-kiel.venuzle.com/events/120",
        },
      },
    });

    expect(
      JSON.parse(fs.readFileSync(path.join(rootDir, "workouts-detail.json"), "utf8")),
    ).toMatchObject({
      "haw-kiel-120": {
        title: "Tischfußball",
      },
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(rootDir, "workouts-detail.json"), "utf8"))["haw-kiel-120"],
    ).not.toHaveProperty("description");
    expect(
      JSON.parse(fs.readFileSync(path.join(rootDir, "workouts-manifest.json"), "utf8")),
    ).toMatchObject({
      version: "2026-03-22T11-40-34-933Z",
      detailKey: "workouts/detail/2026-03-22T11-40-34-933Z.json",
    });
  });
});
