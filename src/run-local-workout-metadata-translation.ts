import * as fs from "fs";
import * as path from "path";
import { loadLocalEnv } from "./local/load-local-env";
import { createLocalSnapshotBucket } from "./local/local-snapshot-bucket";
import { syncWorkoutMetadataLocales } from "./pipeline/build-public-snapshots";

type WorkoutsManifest = {
  version: string;
  metadataLocaleKey?: string;
  [key: string]: unknown;
};

async function main() {
  loadLocalEnv();

  if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is required");
  }

  const outDir = path.join(process.cwd(), "out");
  const detailPath = path.join(outDir, "workouts-detail.json");
  const manifestPath = path.join(outDir, "workouts-manifest.json");

  if (!fs.existsSync(detailPath)) {
    throw new Error(`Missing ${detailPath}`);
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}`);
  }

  const workoutsDetail = JSON.parse(fs.readFileSync(detailPath, "utf8")) as Record<string, unknown>;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as WorkoutsManifest;

  if (!manifest.version) {
    throw new Error("workouts-manifest.json is missing version");
  }

  const metadataLocaleKey = await syncWorkoutMetadataLocales(
    Object.values(workoutsDetail),
    manifest.version,
    {
      localeBucket: createLocalSnapshotBucket(outDir),
      translationApiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
    },
  );

  const nextManifest: WorkoutsManifest = {
    ...manifest,
    metadataLocaleKey,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2));

  console.log(`Synced workout metadata locales to ${path.join(outDir, metadataLocaleKey)}`);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(detail);
  process.exitCode = 1;
});
