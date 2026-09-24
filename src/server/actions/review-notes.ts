"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { reviewNotes } from "@/server/db/schema";

export async function listReviewNotes(surveyConfigId: string) {
  return db.query.reviewNotes.findMany({ where: eq(reviewNotes.surveyConfigId, surveyConfigId) });
}

export async function setReviewStatus(
  surveyConfigId: string,
  targetKind: "household" | "child",
  targetOdkId: string,
  flagCode: string,
  status: "open" | "corrected_in_odk" | "not_an_error",
  note: string | null,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const existing = await db.query.reviewNotes.findFirst({
    where: and(
      eq(reviewNotes.surveyConfigId, surveyConfigId),
      eq(reviewNotes.targetKind, targetKind),
      eq(reviewNotes.targetOdkId, targetOdkId),
      eq(reviewNotes.flagCode, flagCode),
    ),
  });

  if (existing) {
    await db
      .update(reviewNotes)
      .set({ status, note, reviewedBy: session.user.id, updatedAt: new Date() })
      .where(eq(reviewNotes.id, existing.id));
  } else {
    await db.insert(reviewNotes).values({
      surveyConfigId,
      targetKind,
      targetOdkId,
      flagCode,
      status,
      note,
      reviewedBy: session.user.id,
    });
  }

  revalidatePath(`/survey/${surveyConfigId}`);
}
