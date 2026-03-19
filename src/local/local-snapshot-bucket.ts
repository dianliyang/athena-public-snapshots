import * as fs from "fs";
import * as path from "path";
import type { R2BucketLike } from "../publish/publish-to-r2";

export type LocalSnapshotBucket = R2BucketLike & {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
};

export function createLocalSnapshotBucket(rootDir: string): LocalSnapshotBucket {
  const legacyLocalePaths: Record<string, string> = {
    "workouts/locales/title/": path.join(rootDir, "workout-title-locale.json"),
    "workouts/locales/category/": path.join(rootDir, "workout-category-locale.json"),
  };

  function resolveKeyPath(key: string): string {
    return path.join(rootDir, key);
  }

  function findLegacyLocalePath(key: string): string | null {
    for (const [prefix, filePath] of Object.entries(legacyLocalePaths)) {
      if (key.startsWith(prefix)) {
        return filePath;
      }
    }

    return null;
  }

  return {
    async get(key: string) {
      const filePath = resolveKeyPath(key);
      const fallbackPath = findLegacyLocalePath(key);
      const readablePath = fs.existsSync(filePath)
        ? filePath
        : fallbackPath && fs.existsSync(fallbackPath)
          ? fallbackPath
          : null;
      if (!readablePath) return null;

      return {
        async text() {
          return fs.promises.readFile(readablePath, "utf8");
        },
      };
    },
    async put(key: string, value: string) {
      const filePath = resolveKeyPath(key);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, value, "utf8");

      const legacyPath = findLegacyLocalePath(key);
      if (legacyPath) {
        await fs.promises.writeFile(legacyPath, value, "utf8");
      }
    },
  };
}
