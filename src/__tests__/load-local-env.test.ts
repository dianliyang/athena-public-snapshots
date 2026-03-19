import { afterEach, describe, expect, test } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadLocalEnv, parseEnvLine } from "../local/load-local-env";

let tempDirs: string[] = [];
const originalApiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];

  if (originalApiKey === undefined) {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
  } else {
    process.env.GOOGLE_TRANSLATE_API_KEY = originalApiKey;
  }
});

describe("loadLocalEnv", () => {
  test("parses quoted and exported env assignments", () => {
    expect(parseEnvLine("GOOGLE_TRANSLATE_API_KEY=test-key")).toEqual([
      "GOOGLE_TRANSLATE_API_KEY",
      "test-key",
    ]);
    expect(parseEnvLine("export GOOGLE_TRANSLATE_API_KEY=\"quoted-key\"")).toEqual([
      "GOOGLE_TRANSLATE_API_KEY",
      "quoted-key",
    ]);
  });

  test("loads GOOGLE_TRANSLATE_API_KEY from .env without overriding existing env", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "athena-env-"));
    tempDirs.push(rootDir);
    const envPath = path.join(rootDir, ".env");

    fs.writeFileSync(envPath, "GOOGLE_TRANSLATE_API_KEY=from-dotenv\n", "utf8");

    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    loadLocalEnv(envPath);
    expect(process.env.GOOGLE_TRANSLATE_API_KEY).toBe("from-dotenv");

    process.env.GOOGLE_TRANSLATE_API_KEY = "already-set";
    loadLocalEnv(envPath);
    expect(process.env.GOOGLE_TRANSLATE_API_KEY).toBe("already-set");
  });
});
