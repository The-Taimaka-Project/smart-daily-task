"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { manualExclusions } from "@/server/db/schema";

export async function listManualExclusionsForDisplay(surveyConfigId: string) {
  return db.query.manualExclusions.findMany({
    where: eq(manualExclusions.surveyConfigId, surveyConfigId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function addManualExclusion(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const surveyConfigId = String(formData.get("surveyConfigId") ?? "");
  const targetOdkId = String(formData.get("targetOdkId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!surveyConfigId || !targetOdkId) {
    throw new Error("uuid is required.");
  }

  await db
    .insert(manualExclusions)
    .values({ surveyConfigId, targetOdkId, reason, createdBy: session.user.id })
    .onConflictDoUpdate({
      target: [manualExclusions.surveyConfigId, manualExclusions.targetOdkId],
      set: { reason, createdBy: session.user.id },
    });

  revalidatePath(`/survey/${surveyConfigId}`, "layout");
}

export async function removeManualExclusion(surveyConfigId: string, id: string) {
  await db.delete(manualExclusions).where(eq(manualExclusions.id, id));
  revalidatePath(`/survey/${surveyConfigId}`, "layout");
}
