import { MIT } from '../lib/scrapers/mit';
import { Stanford } from '../lib/scrapers/stanford';
import { CMU } from '../lib/scrapers/cmu';
import { UCB } from '../lib/scrapers/ucb';
import { CAU } from '../lib/scrapers/cau';
import { SupabaseDatabase } from '../lib/supabase/server';
import { BaseScraper } from '../lib/scrapers/BaseScraper';
import { completeScraperJob, failScraperJob, startScraperJob } from '../lib/scrapers/scraper-jobs';
import { retrieveWorkoutSourceBatches } from '../lib/scrapers/workout-sources';

function isCauProjectSeminarWorkshop(
  item: { title?: string; details?: Record<string, unknown> },
): boolean {
  const category = typeof item.details?.category === "string" ? item.details.category : "";
  const projectTableCategories = new Set([
    "Seminar",
    "Advanced Project",
    "Involvement in a working group",
    "Open Elective",
    "Colloquia and study groups",
    "Master Thesis Supervision Seminar",
  ]);
  const title = (item.title || "").toLowerCase();
  return (
    projectTableCategories.has(category) ||
    title.includes("project") ||
    title.includes("seminar") ||
    title.includes("workshop")
  );
}

async function runScraper(scraper: BaseScraper, db: SupabaseDatabase) {
  const startedAtMs = Date.now();
  const jobId = await startScraperJob({
    university: scraper.name,
    semester: scraper.semester,
    trigger: "script",
    forceUpdate: false,
    jobType: "courses",
  });

  try {
    console.log(`\n=== Running Scraper: ${scraper.name.toUpperCase()} ===`);
    
    const items = await scraper.retrieve();
    console.log(`Successfully scraped ${items.length} items from ${scraper.name}.`);

    if (items.length > 0) {
      if (scraper.name === 'cau') {
        // Partition CAU items: project/seminar/workshop -> projects_seminars, others -> courses
        const projectsSeminars = items.filter(item =>
          isCauProjectSeminarWorkshop({
            title: item.title,
            details: (item.details as Record<string, unknown> | undefined) || {},
          }),
        );
        const standardCourses = items.filter(item =>
          !isCauProjectSeminarWorkshop({
            title: item.title,
            details: (item.details as Record<string, unknown> | undefined) || {},
          }),
        );

        console.log(`[cau] Partitioned into ${standardCourses.length} standard courses and ${projectsSeminars.length} projects/seminars.`);
        
        if (standardCourses.length > 0) await db.saveCourses(standardCourses);
        if (projectsSeminars.length > 0) await db.saveProjectsSeminars(projectsSeminars);
      } else {
        await db.saveCourses(items);
      }
      await completeScraperJob(jobId, {
        courseCount: items.length,
        durationMs: Date.now() - startedAtMs,
        meta: { semester: scraper.semester || null },
      });
      console.log(`Completed ${scraper.name}.`);
    } else {
      await completeScraperJob(jobId, {
        courseCount: 0,
        durationMs: Date.now() - startedAtMs,
        meta: { semester: scraper.semester || null },
      });
    }
  } catch (error) {
    await failScraperJob(jobId, error, Date.now() - startedAtMs);
    console.error(`Failed to run scraper for ${scraper.name}:`, error);
  }
}

async function runWorkoutScraper(db: SupabaseDatabase, semester: string) {
  const startedAtMs = Date.now();
  const jobId = await startScraperJob({
    university: "cau-sport",
    semester,
    trigger: "script",
    forceUpdate: true,
    jobType: "workouts",
  });
  try {
    console.log(`\n=== Running Workout Scrapers ===`);
    const retrieval = await retrieveWorkoutSourceBatches({ semester, source: "cau-sport" });
    const workoutBatches = retrieval.batches;
    const workouts = workoutBatches.flatMap((batch) => batch.workouts);
    console.log(`Successfully scraped ${workouts.length} workouts across ${workoutBatches.length} sources.`);

    if (workouts.length > 0) {
      const { createAdminClient } = await import('../lib/supabase/server');
      const supabase = createAdminClient();
      for (const batch of workoutBatches) {
        console.log(`[Supabase] Overriding existing workouts for ${batch.source}${batch.pageUrl ? ` (${batch.pageUrl})` : ""}...`);
        const deleteQuery = supabase.from('workouts').delete().eq('source', batch.source);
        if (batch.pageUrl) await deleteQuery.eq('url', batch.pageUrl);
        else await deleteQuery;
      }

      await db.saveWorkouts(workouts);
      console.log(`Completed workout scraping.`);
    }

    await completeScraperJob(jobId, {
      courseCount: workouts.length,
      durationMs: Date.now() - startedAtMs,
      meta: { semester, saved_workouts: workouts.length },
    });
  } catch (error) {
    await failScraperJob(jobId, error, Date.now() - startedAtMs);
    console.error(`Failed to run workout scraper:`, error);
  }
}

async function main() {
  const db = new SupabaseDatabase();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const semesterArg = args.find(arg => arg.startsWith('--semester='));
  const semester = semesterArg ? semesterArg.split('=')[1] : 'fa25';

  const universityArg = args.find(arg => arg.startsWith('--university='));
  const targetUniversity = universityArg ? universityArg.split('=')[1].toLowerCase() : null;

  let scrapers: BaseScraper[] = [
    new MIT(),
    new Stanford(),
    new CMU(),
    new UCB(),
    new CAU()
  ];

  if (targetUniversity) {
    scrapers = scrapers.filter(s => s.name.toLowerCase() === targetUniversity);
    if (scrapers.length === 0 && targetUniversity !== 'cau-sport') {
      console.error(`University "${targetUniversity}" not found.`);
      process.exit(1);
    }
  }

  console.log(`Starting scrape... (Semester: ${semester}${targetUniversity ? `, University: ${targetUniversity}` : ''})`);
  console.log(`Target: Supabase Database`);

  for (const scraper of scrapers) {
    scraper.semester = semester;
    scraper.db = db;
    await runScraper(scraper, db);
  }

  // Run workout scraper if no filter or if explicitly requested
  if (!targetUniversity || targetUniversity === 'cau-sport') {
    await runWorkoutScraper(db, semester);
  }

  console.log("\nAll requested scrapers finished.");
}

main();
