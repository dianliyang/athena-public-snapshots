import { MIT } from './lib/scrapers/mit';
import { Stanford } from './lib/scrapers/stanford';
import { CMU } from './lib/scrapers/cmu';
import { UCB } from './lib/scrapers/ucb';
import { retrieveWorkoutSourceBatches } from './lib/scrapers/workout-sources';
import { buildCoursesSnapshot } from './build/build-courses-snapshot';
import { buildWorkoutsSnapshot } from './build/build-workouts-snapshot';
import { i18n } from './lib/i18n';
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

  // 1. Courses
  const allCourseScrapers = [new MIT(), new Stanford(), new CMU(), new UCB()];
  const courseScrapers = targetUni 
    ? allCourseScrapers.filter(s => s.name.toLowerCase() === targetUni)
    : allCourseScrapers;

  let allCourses: any[] = [];
  if (courseScrapers.length > 0) {
    for (const scraper of courseScrapers) {
      try {
        const items = await scraper.retrieve();
        allCourses = allCourses.concat(items.map((item: any) => ({
          id: `${item.university}-${item.courseCode}`,
          title: item.title,
          courseCode: item.courseCode,
          university: item.university,
          description: item.description,
          credit: item.credit,
          level: item.level,
          department: item.department,
          url: item.url,
          resources: item.resources,
          instructors: item.instructors,
        })));
      } catch (e) {
        console.error(`Failed to scrape ${scraper.name}:`, e);
      }
    }
  }

  if (allCourses.length) {
    const { manifest, browse, detail } = buildCoursesSnapshot(allCourses, version);
    fs.writeFileSync(path.join(outDir, 'courses-manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(outDir, 'courses-browse.json'), JSON.stringify(browse, null, 2));
    fs.writeFileSync(path.join(outDir, 'courses-detail.json'), JSON.stringify(detail, null, 2));
    
    const courseVectors = allCourses.map(c => ({
      id: c.id,
      text: `${c.title} ${c.description || ''}`
    }));
    fs.writeFileSync(path.join(outDir, 'courses-vectors.json'), JSON.stringify(courseVectors, null, 2));
  }

  // 2. Workouts
  const allWorkoutSources: Array<'cau-sport' | 'urban-apes'> = ['cau-sport', 'urban-apes'];
  const workoutSources = targetUni
    ? allWorkoutSources.filter(s => s === targetUni)
    : allWorkoutSources;

  if (workoutSources.length > 0) {
    try {
      const retrieval = await retrieveWorkoutSourceBatches({ semester: 'wi25', sources: workoutSources });
      const workouts = retrieval.batches.flatMap(b => b.workouts);
      const normalized = workouts.map((w: any) => ({
        ...w,
        id: `${w.source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${w.courseCode}`,
        title: w.title,
        provider: w.source,
      }));
      if (normalized.length) {
        const { manifest, browse, detail } = buildWorkoutsSnapshot(normalized, version);
        fs.writeFileSync(path.join(outDir, 'workouts-manifest.json'), JSON.stringify(manifest, null, 2));
        fs.writeFileSync(path.join(outDir, 'workouts-browse.json'), JSON.stringify(browse, null, 2));
        fs.writeFileSync(path.join(outDir, 'workouts-detail.json'), JSON.stringify(detail, null, 2));

        const workoutVectors = normalized.map(w => ({
          id: w.id,
          text: `${w.title} ${w.description || ''}`
        }));
        fs.writeFileSync(path.join(outDir, 'workouts-vectors.json'), JSON.stringify(workoutVectors, null, 2));
      }
    } catch (e) {
      console.error('Failed to scrape workouts:', e);
    }
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
