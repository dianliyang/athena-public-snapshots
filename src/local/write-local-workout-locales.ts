import * as fs from "node:fs";
import * as path from "node:path";
import type { ManifestSnapshot } from "../schema";

type BucketWithGet = {
  get?(key: string): Promise<{ text(): Promise<string> } | null>;
};

const LEGACY_PATHS: Partial<Record<keyof ManifestSnapshot, string>> = {
  titleLocaleKey: "workout-title-locale.json",
  categoryLocaleKey: "workout-category-locale.json",
};

export async function writeLocalWorkoutLocales(
  rootDir: string,
  bucket: BucketWithGet,
  manifest: Pick<
    ManifestSnapshot,
    "titleLocaleKey" | "categoryLocaleKey" | "metadataLocaleKey" | "wikipediaLocaleKey"
  >,
): Promise<void> {
  const localeKeys = [
    "titleLocaleKey",
    "categoryLocaleKey",
    "metadataLocaleKey",
    "wikipediaLocaleKey",
  ] as const;

  for (const manifestKey of localeKeys) {
    const objectKey = manifest[manifestKey];
    if (!objectKey || !bucket.get) continue;

    const object = await bucket.get(objectKey);
    if (!object) continue;

    const text = await object.text();
    const filePath = path.join(rootDir, objectKey);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");

    const legacyPath = LEGACY_PATHS[manifestKey];
    if (legacyPath) {
      fs.writeFileSync(path.join(rootDir, legacyPath), text, "utf8");
    }
  }
}
