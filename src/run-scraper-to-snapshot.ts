import { buildPublicSnapshots } from './pipeline/build-public-snapshots';
import { loadLocalEnv } from "./local/load-local-env";
import { createLocalSnapshotBucket } from "./local/local-snapshot-bucket";
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  loadLocalEnv();

  const args = process.argv.slice(2);
  const targetUni = args.find(arg => arg.startsWith('--target='))?.split('=')[1]?.toLowerCase();

  const version = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const localBucket = createLocalSnapshotBucket(outDir);

  const snapshots = await buildPublicSnapshots({
    version,
    target: targetUni,
    includeCourses: false,
  }, {
    localeBucket: localBucket,
    translationApiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
  });

  // 1. Courses
  if (snapshots.courses) {
    const { manifest, browse, detail } = snapshots.courses;
    fs.writeFileSync(path.join(outDir, 'courses-manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(outDir, 'courses-browse.json'), JSON.stringify(browse, null, 2));
    fs.writeFileSync(path.join(outDir, 'courses-detail.json'), JSON.stringify(detail, null, 2));
    
    const courseVectors = Object.values(detail).map(c => ({
      id: c.id,
      text: `${c.title} ${c.description || ''}`
    }));
    fs.writeFileSync(path.join(outDir, 'courses-vectors.json'), JSON.stringify(courseVectors, null, 2));
  }

  // 2. Workouts
  if (snapshots.workouts) {
    const { manifest, browse, detail } = snapshots.workouts;
    fs.writeFileSync(path.join(outDir, 'workouts-manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(outDir, 'workouts-browse.json'), JSON.stringify(browse, null, 2));
    fs.writeFileSync(path.join(outDir, 'workouts-detail.json'), JSON.stringify(detail, null, 2));

    const workoutVectors = Object.values(detail).map(w => ({
      id: w.id,
      text: `${w.title} ${w.description || ''}`
    }));
    fs.writeFileSync(path.join(outDir, 'workouts-vectors.json'), JSON.stringify(workoutVectors, null, 2));
  }

}
main();
