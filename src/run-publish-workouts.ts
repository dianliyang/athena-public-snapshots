import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { buildPublicSnapshots } from "./pipeline/build-public-snapshots";
import { createWranglerR2Bucket } from "./local/wrangler-r2-bucket";
import { loadLocalEnv } from "./local/load-local-env";
import { mergeTargetedWorkoutRefresh } from "./pipeline/merge-targeted-workout-refresh";
import { retrievePublishedWorkoutSnapshot } from "./pipeline/retrieve-published-workout-details";
import { publishSnapshotSet } from "./publish/publish-to-r2";
import { writeLocalWorkoutOutput } from "./local/write-local-workout-output";
import { writeLocalWorkoutLocales } from "./local/write-local-workout-locales";

type Mode = "refresh" | "legacy";

function createLocalOnlyLocaleBucket(
  bucket: ReturnType<typeof createWranglerR2Bucket>,
) {
  const cache = new Map<string, string>();

  return {
    async get(key: string) {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return { text: async () => cached };
      }

      return bucket.get?.(key) ?? null;
    },
    async put(key: string, value: string) {
      cache.set(key, value);
    },
  };
}

function parseArgs(args: string[]): {
  mode: Mode;
  target?: string;
  workoutSemester?: string;
  translate: boolean;
  localOnly: boolean;
} {
  const modeArg = args.find((arg) => arg.startsWith("--mode="))?.split("=")[1]?.toLowerCase();
  const mode: Mode = modeArg === "refresh" ? "refresh" : "legacy";
  const target = args.find((arg) => arg.startsWith("--target="))?.split("=")[1]?.toLowerCase();
  const workoutSemester = args.find((arg) => arg.startsWith("--semester="))?.split("=")[1];
  const translate = args.includes("--translate");
  const localOnly = args.includes("--local-only");

  return { mode, target, workoutSemester, translate, localOnly };
}

export async function runPublishWorkouts(args: string[] = process.argv.slice(2)) {
  loadLocalEnv();

  const { mode, target, workoutSemester, translate, localOnly } = parseArgs(args);
  const bucketName = process.env.R2_BUCKET_NAME || "athena-public-catalogs";
  const bucket = createWranglerR2Bucket(bucketName);
  const localeBucket = localOnly ? createLocalOnlyLocaleBucket(bucket) : bucket;

  let publishedSnapshot:
    | Awaited<ReturnType<typeof retrievePublishedWorkoutSnapshot>>
    | undefined;

  try {
    publishedSnapshot = await retrievePublishedWorkoutSnapshot(bucket);
  } catch (error) {
    if (mode === "legacy") throw error;
    console.warn(
      `[${mode}] No published workout snapshot available for locale seeding: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  console.log(
    `[${mode}] Building workout snapshots${target ? ` for target=${target}` : ""}${workoutSemester ? ` semester=${workoutSemester}` : ""}${translate ? " with translation" : ""}`,
  );

  const snapshots = await buildPublicSnapshots(
    {
      target,
      workoutSemester,
    },
    {
      localeBucket,
      ...(translate ? { translationApiKey: process.env.GOOGLE_TRANSLATE_API_KEY } : {}),
      ...(mode === "legacy" && publishedSnapshot
        ? {
            retrieveWorkouts: async () => publishedSnapshot.workouts,
          }
        : {}),
      ...(publishedSnapshot
        ? {
            seedWorkoutLocaleKeys: {
              titleLocaleKey: publishedSnapshot.manifest.titleLocaleKey,
              categoryLocaleKey: publishedSnapshot.manifest.categoryLocaleKey,
              metadataLocaleKey: publishedSnapshot.manifest.metadataLocaleKey,
              wikipediaLocaleKey: publishedSnapshot.manifest.wikipediaLocaleKey,
            },
          }
        : {}),
    },
  );

  if (!snapshots.workouts) {
    throw new Error(`No workout snapshots were built during ${mode} mode`);
  }

  if (mode === "refresh" && target && publishedSnapshot) {
    const merged = mergeTargetedWorkoutRefresh(
      target,
      publishedSnapshot.workouts,
      snapshots.workouts.detail,
      snapshots.workouts.manifest,
    );
    snapshots.workouts.detail = merged.detail;
    snapshots.workouts.manifest = merged.manifest;
  }

  const outDir = path.join(process.cwd(), "out");
  writeLocalWorkoutOutput(outDir, snapshots.workouts);
  console.log(
    `[${mode}] Wrote local workout output to ${outDir}`,
  );

  if (localOnly) {
    await writeLocalWorkoutLocales(outDir, localeBucket, snapshots.workouts.manifest);
    console.log(
      `[${mode}] Finished local-only workout snapshot build for version ${snapshots.workouts.manifest.version}`,
    );
    return;
  }

  console.log(
    `[${mode}] Publishing ${snapshots.workouts.manifest.itemCount} workout records to R2 bucket ${bucketName}`,
  );
  await publishSnapshotSet(bucket, {
    baseKey: "workouts",
    manifest: snapshots.workouts.manifest,
    detail: snapshots.workouts.detail,
  });
  await writeLocalWorkoutLocales(outDir, bucket, snapshots.workouts.manifest);
  console.log(
    `[${mode}] Finished publishing workout snapshots for version ${snapshots.workouts.manifest.version}`,
  );
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  runPublishWorkouts().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
