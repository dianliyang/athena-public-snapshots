import { MIT } from './lib/scrapers/mit';
import { Stanford } from './lib/scrapers/stanford';
import { CMU } from './lib/scrapers/cmu';
import { UCB } from './lib/scrapers/ucb';
import { CAUSport } from './lib/scrapers/cau-sport';
import { buildCoursesSnapshot } from './build/build-courses-snapshot';
import { buildWorkoutsSnapshot } from './build/build-workouts-snapshot';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const version = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // 1. Courses
  const courseScrapers = [new MIT(), new Stanford(), new CMU(), new UCB()];
  let allCourses: any[] = [];
  for (const scraper of courseScrapers) {
    try {
      const items = await scraper.retrieve();
      allCourses = allCourses.concat(items.map((item: any) => ({
        id: `${item.university}-${item.courseCode}`,
        title: item.title,
        courseCode: item.courseCode,
        university: item.university,
        description: item.description,
      })));
    } catch (e) {}
  }
  if (allCourses.length) {
    const snapshot = buildCoursesSnapshot(allCourses, version);
    fs.writeFileSync(path.join(outDir, 'courses-manifest.json'), JSON.stringify(snapshot.manifest, null, 2));
    fs.writeFileSync(path.join(outDir, 'courses-browse.json'), JSON.stringify(snapshot.browse, null, 2));
    fs.writeFileSync(path.join(outDir, 'courses-detail.json'), JSON.stringify(snapshot.detail, null, 2));
    
    const courseVectors = allCourses.map(c => ({
      id: c.id,
      text: `${c.title} ${c.description || ''}`
    }));
    fs.writeFileSync(path.join(outDir, 'courses-vectors.json'), JSON.stringify(courseVectors, null, 2));
  }

  // 2. Workouts
  try {
    const cauSport = new CAUSport();
    cauSport.semester = 'wi25';
    const items = await cauSport.retrieve();
    const normalized = items.map((w: any) => ({
      id: `${w.source}-${w.courseCode}`,
      title: w.title,
      provider: w.source,
      category: w.category,
      description: w.titleEn || w.title,
    }));
    if (normalized.length) {
      const snapshot = buildWorkoutsSnapshot(normalized, version);
      fs.writeFileSync(path.join(outDir, 'workouts-manifest.json'), JSON.stringify(snapshot.manifest, null, 2));
      fs.writeFileSync(path.join(outDir, 'workouts-browse.json'), JSON.stringify(snapshot.browse, null, 2));
      fs.writeFileSync(path.join(outDir, 'workouts-detail.json'), JSON.stringify(snapshot.detail, null, 2));

      const workoutVectors = normalized.map(w => ({
        id: w.id,
        text: `${w.title} ${w.description || ''}`
      }));
      fs.writeFileSync(path.join(outDir, 'workouts-vectors.json'), JSON.stringify(workoutVectors, null, 2));
    }
  } catch (e) {}
}
main();
