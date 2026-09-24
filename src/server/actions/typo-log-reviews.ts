"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { typoLogReviews } from "@/server/db/schema";

export async function listTypoLogReviews(surveyConfigId: string) {
  return db.query.typoLogReviews.findMany({ where: eq(typoLogReviews.surveyConfigId, surveyConfigId) });
}

export type TypoLogPatch = {
  isTypo?: boolean | null;
  correctBirthdate?: string | null;
  correctAgeMonths?: number | null;
  correctWeightKg?: number | null;
  correctHeightCm?: number | null;
  correctMuacMm?: number | null;
  note?: string | null;
  daniRevise?: boolean | null;
};

export async function setTypoLogReview(surveyConfigId: string, targetOdkId: string, patch: TypoLogPatch) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const existing = await db.query.typoLogReviews.findFirst({
    where: and(eq(typoLogReviews.surveyConfigId, surveyConfigId), eq(typoLogReviews.targetOdkId, targetOdkId)),
  });

  if (existing) {
    await db
      .update(typoLogReviews)
      .set({ ...patch, updatedBy: session.user.id, updatedAt: new Date() })
      .where(eq(typoLogReviews.id, existing.id));
  } else {
    await db.insert(typoLogReviews).values({
      surveyConfigId,
      targetOdkId,
      ...patch,
      updatedBy: session.user.id,
    });
  }

  revalidatePath(`/survey/${surveyConfigId}/typo-log`);
}
