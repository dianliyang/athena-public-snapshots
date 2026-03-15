import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
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
});
