import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { pullJobs } from "@/server/db/schema";
import { getOdkSessionForUser } from "@/server/odk/session-store";
import { runPullJob } from "@/server/pipeline/run-pull";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobs = await db.query.pullJobs.findMany({
    where: eq(pullJobs.surveyConfigId, id),
    orderBy: [desc(pullJobs.createdAt)],
    limit: 10,
  });
  return NextResponse.json(jobs);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: surveyConfigId } = await params;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const odkState = await getOdkSessionForUser(session.user.id);
  if (odkState.status !== "active") {
    return NextResponse.json(
      { error: "Connect your ODK Central account first (see /odk-login)." },
      { status: 409 },
    );
  }

  const [job] = await db
    .insert(pullJobs)
    .values({ surveyConfigId, status: "pending", triggeredBy: session.user.id })
    .returning();

  // Detached: this is a long-lived Node process (`next start`, not an edge
  // function), so the pull keeps running after this response is sent. The
  // UI polls GET /api/survey-configs/[id]/pull for job status.
  runPullJob(job.id, odkState.session).catch((err) => {
    console.error(`Pull job ${job.id} failed:`, err);
  });

  return NextResponse.json(job, { status: 202 });
}
