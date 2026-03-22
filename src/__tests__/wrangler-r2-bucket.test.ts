import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

let tempDirs: string[] = [];

afterEach(() => {
  execFileMock.mockReset();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("createWranglerR2Bucket", () => {
  test("returns object contents even after temporary files are cleaned up", async () => {
    execFileMock.mockImplementation((_command, args, _options, callback) => {
      const fileFlagIndex = args.indexOf("--file");
      const filePath = args[fileFlagIndex + 1];
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({ hello: "world" }), "utf8");
      callback(null, { stdout: "", stderr: "" });
    });

    const { createWranglerR2Bucket } = await import("../local/wrangler-r2-bucket");
    const bucket = createWranglerR2Bucket("athena-public-catalogs");
    const object = await bucket.get("workouts/manifest.json");

    expect(object).not.toBeNull();
    await expect(object?.text()).resolves.toBe(JSON.stringify({ hello: "world" }));
  });

  test("returns null when wrangler cannot fetch the object", async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      callback(new Error("not found"));
    });

    const { createWranglerR2Bucket } = await import("../local/wrangler-r2-bucket");
    const bucket = createWranglerR2Bucket("athena-public-catalogs");

    await expect(bucket.get("missing.json")).resolves.toBeNull();
  });
});
