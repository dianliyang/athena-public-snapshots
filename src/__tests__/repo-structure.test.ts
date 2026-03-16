import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

describe("athena-public-snapshots repository structure", () => {
  test("contains the expected foundation files", () => {
    expect(existsSync(path.join(repoRoot, "package.json"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "README.md"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "wrangler.jsonc"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "src"))).toBe(true);
  });

  test("uses unique wrangler binding names", () => {
    const wranglerConfig = readFileSync(path.join(repoRoot, "wrangler.jsonc"), "utf8");
    const bindingNames = Array.from(
      wranglerConfig.matchAll(/"binding"\s*:\s*"([^"]+)"/g),
      (match) => match[1],
    );

    expect(new Set(bindingNames).size).toBe(bindingNames.length);
  });
});
