import { createAdminClient } from "@/lib/supabase/server";

type ScraperJobType = "courses" | "workouts";
type ScraperJobTrigger = "manual" | "script" | "cron" | "api";

type StartJobInput = {
  university: string;
  semester?: string;
  trigger: ScraperJobTrigger;
  triggeredByUserId?: string;
  forceUpdate?: boolean;
  jobType?: ScraperJobType;
  meta?: Record<string, unknown>;
};

type CompleteJobInput = {
  courseCount: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

function asPlainError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : JSON.stringify(error);
}

export async function startScraperJob(input: StartJobInput): Promise<number | null> {
  const supabase = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = new Date().toISOString();

  const richPayload = {
    university: input.university,
    status: "running",
    started_at: now,
    semester: input.semester || null,
    triggered_by: input.trigger,
    triggered_by_user_id: input.triggeredByUserId || null,
    force_update: Boolean(input.forceUpdate),
    job_type: input.jobType || "courses",
    meta: input.meta || {},
  };

  const { data, error } = await supabase
    .from("scraper_jobs")
    .insert(richPayload)
    .select("id")
    .maybeSingle();

  if (!error && data?.id) return data.id as number;

  // Backward-compatible fallback for older schema.
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("scraper_jobs")
    .insert({
      university: input.university,
      status: "running",
      started_at: now,
    })
    .select("id")
    .maybeSingle();

  if (fallbackError) {
    console.error("[scraper_jobs] failed to create job:", asPlainError(fallbackError));
    return null;
  }
  return (fallbackData?.id as number | undefined) || null;
}

export async function completeScraperJob(jobId: number | null, input: CompleteJobInput) {
  if (!jobId) return;
  const supabase = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = new Date().toISOString();

  const richUpdate = {
    status: "completed",
    completed_at: now,
    course_count: input.courseCount,
    duration_ms: input.durationMs ?? null,
    meta: input.meta || {},
  };

  const { error } = await supabase
    .from("scraper_jobs")
    .update(richUpdate)
    .eq("id", jobId);

  if (!error) return;

  const { error: fallbackError } = await supabase
    .from("scraper_jobs")
    .update({
      status: "completed",
      completed_at: now,
      course_count: input.courseCount,
    })
    .eq("id", jobId);

  if (fallbackError) {
    console.error(`[scraper_jobs] failed to complete job ${jobId}:`, asPlainError(fallbackError));
  }
}

export async function failScraperJob(jobId: number | null, error: unknown, durationMs?: number) {
  if (!jobId) return;
  const supabase = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = new Date().toISOString();
  const errorText = asPlainError(error).slice(0, 4000);

  const richUpdate = {
    status: "failed",
    completed_at: now,
    error: errorText,
    duration_ms: durationMs ?? null,
  };

  const { error: updateError } = await supabase
    .from("scraper_jobs")
    .update(richUpdate)
    .eq("id", jobId);

  if (!updateError) return;

  const { error: fallbackError } = await supabase
    .from("scraper_jobs")
    .update({
      status: "failed",
      completed_at: now,
      error: errorText,
    })
    .eq("id", jobId);

  if (fallbackError) {
    console.error(`[scraper_jobs] failed to fail job ${jobId}:`, asPlainError(fallbackError));
  }
}

export async function getLatestCompletedWorkoutMetaField<T = Record<string, unknown>>(
  field: string,
): Promise<T | null> {
  const supabase = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const { data, error } = await supabase
    .from("scraper_jobs")
    .select("meta")
    .eq("status", "completed")
    .eq("job_type", "workouts")
    .order("completed_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(`[scraper_jobs] failed to load recent workout meta for ${field}:`, asPlainError(error));
    return null;
  }

  for (const row of data || []) {
    const meta = row?.meta && typeof row.meta === "object"
      ? (row.meta as Record<string, unknown>)
      : null;
    if (!meta || !(field in meta)) continue;
    return meta[field] as T;
  }

  return null;
}
