import { i18n } from './lib/i18n';
import { buildPublicSnapshots } from './pipeline/build-public-snapshots';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const targetUni = args.find(arg => arg.startsWith('--target='))?.split('=')[1]?.toLowerCase();

  const version = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'out');
  const localesDir = path.join(outDir, 'locales');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  if (!fs.existsSync(localesDir)) fs.mkdirSync(localesDir);

  const snapshots = await buildPublicSnapshots({ version, target: targetUni, workoutSemester: 'wi25' });

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

  // 3. Locales
  console.log('\nExporting locale dictionaries...');
  // Currently we only have German source strings that translate to English
  const deDict = i18n.getDictionary('de');
  
  // Save de.json (the keys are the keys)
  const deJson: Record<string, string> = {};
  for (const key of Object.keys(deDict)) {
    deJson[key] = key; // In German, "Akrobatik" is "Akrobatik"
  }
  fs.writeFileSync(path.join(localesDir, 'de.json'), JSON.stringify(deJson, null, 2));

  // Save en.json (the values are the translations)
  fs.writeFileSync(path.join(localesDir, 'en.json'), JSON.stringify(deDict, null, 2));

  // Placeholders for others
  fs.writeFileSync(path.join(localesDir, 'zh-CN.json'), JSON.stringify({}, null, 2));
  fs.writeFileSync(path.join(localesDir, 'ja.json'), JSON.stringify({}, null, 2));
  fs.writeFileSync(path.join(localesDir, 'kr.json'), JSON.stringify({}, null, 2));

  console.log(`Locales exported to ${localesDir}`);
}
main();
