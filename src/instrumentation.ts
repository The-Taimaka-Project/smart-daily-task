/**
 * Runs once when the Next.js server process boots (see
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
 *
 * A pull job runs as a detached background task inside this same Node
 * process (see runPullJob / the pull route handler) -- it has no
 * persistence of its own beyond the DB row. If the process is restarted
 * (a deploy, a crash) while a job is mid-flight, the job dies silently: its
 * `pull_jobs` row is left stuck at status "pending"/"running" forever,
 * because nothing was still running to ever mark it "error". The UI then
 * shows an indefinite, misleading "still pulling" with no way to tell the
 * difference from a genuinely slow pull. Sweeping any such orphaned rows to
 * "error" on boot -- the only moment a previous process's jobs can be
 * distinguished from this one's -- fixes that.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { db } = await import("@/server/db/client");
  const { pullJobs } = await import("@/server/db/schema");
  const { inArray } = await import("drizzle-orm");

  await db
    .update(pullJobs)
    .set({
      status: "error",
      progress: null,
      finishedAt: new Date(),
      errorMessage: "Orphaned by a server restart -- the process running this pull was replaced before it finished.",
    })
    .where(inArray(pullJobs.status, ["pending", "running"]));
}
