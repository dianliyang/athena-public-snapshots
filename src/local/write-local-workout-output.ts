import * as fs from "node:fs";
import * as path from "node:path";
import type { ManifestSnapshot, WorkoutsDetailSnapshot } from "../schema";

export function writeLocalWorkoutOutput(
  rootDir: string,
  workouts: {
    manifest: ManifestSnapshot;
    detail: WorkoutsDetailSnapshot;
  },
): void {
  const sanitizedDetail = Object.fromEntries(
    Object.entries(workouts.detail).map(([id, workout]) => {
      const { description: _description, ...rest } =
        workout as typeof workout & { description?: unknown };
      return [id, rest];
    }),
  );

  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "workouts-detail.json"),
    JSON.stringify(sanitizedDetail, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(rootDir, "workouts-manifest.json"),
    JSON.stringify(workouts.manifest, null, 2),
    "utf8",
  );
}
