"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { itpReferralReviews } from "@/server/db/schema";

/** Shared across every teammate who opens this survey config -- stored in
 * the database, not per-browser, so a colleague's yes/no + note is visible
 * to everyone else after they refresh. */
export async function listItpReferralReviews(surveyConfigId: string) {
  return db.query.itpReferralReviews.findMany({
    where: eq(itpReferralReviews.surveyConfigId, surveyConfigId),
  });
}

export async function setItpReferralReview(
  surveyConfigId: string,
  targetKind: "child" | "outside_child",
  targetOdkId: string,
  enrolled: boolean | null,
  note: string | null,
  pid: string | null,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const existing = await db.query.itpReferralReviews.findFirst({
    where: and(
      eq(itpReferralReviews.surveyConfigId, surveyConfigId),
      eq(itpReferralReviews.targetKind, targetKind),
      eq(itpReferralReviews.targetOdkId, targetOdkId),
    ),
  });

  if (existing) {
    await db
      .update(itpReferralReviews)
      .set({ enrolled, note, pid, updatedBy: session.user.id, updatedAt: new Date() })
      .where(eq(itpReferralReviews.id, existing.id));
  } else {
    await db.insert(itpReferralReviews).values({
      surveyConfigId,
      targetKind,
      targetOdkId,
      enrolled,
      note,
      pid,
      updatedBy: session.user.id,
    });
  }

  revalidatePath(`/survey/${surveyConfigId}`);
}
