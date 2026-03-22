import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { R2BucketLike } from "../publish/publish-to-r2";

const execFileAsync = promisify(execFile);

export type WranglerR2Bucket = R2BucketLike & {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

export function createWranglerR2Bucket(bucketName: string): WranglerR2Bucket {
  return {
    async get(key: string) {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "athena-r2-get-"));
      const filePath = path.join(tmpDir, "object.json");

      try {
        await execFileAsync("npx", [
          "wrangler",
          "r2",
          "object",
          "get",
          `${bucketName}/${key}`,
          "--remote",
          "--file",
          filePath,
        ], { cwd: process.cwd() });
        const content = await fs.promises.readFile(filePath, "utf8");

        return {
          async text() {
            return content;
          },
        };
      } catch {
        return null;
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      }
    },
    async put(key: string, value: string) {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "athena-r2-put-"));
      const filePath = path.join(tmpDir, "object.json");

      try {
        await fs.promises.writeFile(filePath, value, "utf8");
        await execFileAsync("npx", [
          "wrangler",
          "r2",
          "object",
          "put",
          `${bucketName}/${key}`,
          "--remote",
          "--file",
          filePath,
        ], { cwd: process.cwd() });
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      }
    },
  };
}
