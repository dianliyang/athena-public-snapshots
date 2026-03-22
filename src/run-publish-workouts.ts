import { buildPublicSnapshots } from "./pipeline/build-public-snapshots";
import { createWranglerR2Bucket } from "./local/wrangler-r2-bucket";
import { loadLocalEnv } from "./local/load-local-env";
import { mergeTargetedWorkoutRefresh } from "./pipeline/merge-targeted-workout-refresh";
import { retrievePublishedWorkoutSnapshot } from "./pipeline/retrieve-published-workout-details";
import { publishSnapshotSet } from "./publish/publish-to-r2";

type Mode = "refresh" | "legacy";

function parseArgs(args: string[]): {
  mode: Mode;
  target?: string;
  workoutSemester?: string;
} {
  const modeArg = args.find((arg) => arg.startsWith("--mode="))?.split("=")[1]?.toLowerCase();
  const mode: Mode = modeArg === "refresh" ? "refresh" : "legacy";
  const target = args.find((arg) => arg.startsWith("--target="))?.split("=")[1]?.toLowerCase();
  const workoutSemester = args.find((arg) => arg.startsWith("--semester="))?.split("=")[1];

  return { mode, target, workoutSemester };
}

async function main() {
  loadLocalEnv();

  const { mode, target, workoutSemester } = parseArgs(process.argv.slice(2));
  const bucketName = process.env.R2_BUCKET_NAME || "athena-public-catalogs";
  const bucket = createWranglerR2Bucket(bucketName);

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
    `[${mode}] Building workout snapshots${target ? ` for target=${target}` : ""}${workoutSemester ? ` semester=${workoutSemester}` : ""}`,
  );

  const snapshots = await buildPublicSnapshots(
    {
      target,
      workoutSemester,
    },
    {
      localeBucket: bucket,
      translationApiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
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

  console.log(
    `[${mode}] Publishing ${snapshots.workouts.manifest.itemCount} workout records to R2 bucket ${bucketName}`,
  );
  await publishSnapshotSet(bucket, {
    baseKey: "workouts",
    manifest: snapshots.workouts.manifest,
    detail: snapshots.workouts.detail,
  });
  console.log(
    `[${mode}] Finished publishing workout snapshots for version ${snapshots.workouts.manifest.version}`,
  );
}

main();
