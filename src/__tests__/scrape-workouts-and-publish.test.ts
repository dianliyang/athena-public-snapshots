import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts", "scrape-workouts-and-publish.sh");

const tempDirs: string[] = [];

function writeExecutable(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function runScript(args: string[]) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrape-pipeline-test-"));
  tempDirs.push(tempDir);

  const binDir = path.join(tempDir, "bin");
  const logPath = path.join(tempDir, "commands.log");
  fs.mkdirSync(binDir, { recursive: true });

  writeExecutable(
    path.join(binDir, "npm"),
    `#!/usr/bin/env bash
echo "$*" >> "${logPath}"
`,
  );

  writeExecutable(
    path.join(binDir, "npx"),
    `#!/usr/bin/env bash
exit 0
`,
  );

  const result = spawnSync("bash", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    },
  });

  const commands = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean)
    : [];

  return { result, commands };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("scrape-workouts-and-publish.sh", () => {
  test("defaults to legacy mode", () => {
    const { result, commands } = runScript([]);

    expect(result.status).toBe(0);
    expect(commands).toEqual([
      "run publish-workouts -- --mode=legacy",
    ]);
  });

  test("refresh mode runs the unified publish runner", () => {
    const { result, commands } = runScript(["refresh", "--target=ricks-club"]);

    expect(result.status).toBe(0);
    expect(commands).toEqual([
      "run publish-workouts -- --mode=refresh --target=ricks-club",
    ]);
  });

  test("passes through the translate flag", () => {
    const { result, commands } = runScript(["refresh", "--target=ricks-club", "--translate"]);

    expect(result.status).toBe(0);
    expect(commands).toEqual([
      "run publish-workouts -- --mode=refresh --target=ricks-club --translate",
    ]);
  });

  test("passes through the local-only flag", () => {
    const { result, commands } = runScript(["refresh", "--target=cau-sport", "--local-only"]);

    expect(result.status).toBe(0);
    expect(commands).toEqual([
      "run publish-workouts -- --mode=refresh --target=cau-sport --local-only",
    ]);
  });

  test("legacy mode runs the unified publish runner", () => {
    const { result, commands } = runScript(["legacy"]);

    expect(result.status).toBe(0);
    expect(commands).toEqual([
      "run publish-workouts -- --mode=legacy",
    ]);
  });
});
