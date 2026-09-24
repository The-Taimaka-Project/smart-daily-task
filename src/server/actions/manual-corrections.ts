"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { manualCorrections } from "@/server/db/schema";

export async function listManualCorrectionsForDisplay(surveyConfigId: string) {
  return db.query.manualCorrections.findMany({
    where: eq(manualCorrections.surveyConfigId, surveyConfigId),
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });
}

export async function setManualCorrection(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const surveyConfigId = String(formData.get("surveyConfigId") ?? "");
  const targetOdkId = String(formData.get("targetOdkId") ?? "").trim();
  const fieldName = String(formData.get("fieldName") ?? "").trim();
  const correctedValue = String(formData.get("correctedValue") ?? "").trim();

  if (!surveyConfigId || !targetOdkId || !fieldName || !correctedValue) {
    throw new Error("uuid, field, and corrected value are all required.");
  }

  const existing = await db.query.manualCorrections.findFirst({
    where: and(
      eq(manualCorrections.surveyConfigId, surveyConfigId),
      eq(manualCorrections.targetOdkId, targetOdkId),
      eq(manualCorrections.fieldName, fieldName),
    ),
  });

  if (existing) {
    await db
      .update(manualCorrections)
      .set({ correctedValue, createdBy: session.user.id, updatedAt: new Date() })
      .where(eq(manualCorrections.id, existing.id));
  } else {
    await db.insert(manualCorrections).values({
      surveyConfigId,
      targetOdkId,
      fieldName,
      correctedValue,
      createdBy: session.user.id,
    });
  }

  revalidatePath(`/survey/${surveyConfigId}`, "layout");
}

export async function deleteManualCorrection(surveyConfigId: string, id: string) {
  await db.delete(manualCorrections).where(eq(manualCorrections.id, id));
  revalidatePath(`/survey/${surveyConfigId}`, "layout");
}
