"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/server/db/client";
import { clusterAssignments, surveyConfigs } from "@/server/db/schema";
import { parseClusterCsv } from "@/server/pipeline/cluster-csv";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return session.user.id;
}

export async function listSurveyConfigs() {
  return db.query.surveyConfigs.findMany({ orderBy: [desc(surveyConfigs.createdAt)] });
}

export async function getSurveyConfig(id: string) {
  return db.query.surveyConfigs.findFirst({ where: eq(surveyConfigs.id, id) });
}

export async function createSurveyConfig(formData: FormData) {
  const userId = await requireUserId();

  const name = String(formData.get("name") ?? "").trim();
  const odkBaseUrl = String(formData.get("odkBaseUrl") ?? "").trim();
  const odkProjectId = parseInt(String(formData.get("odkProjectId") ?? ""), 10);
  const mainFormId = String(formData.get("mainFormId") ?? "").trim();
  const revisitFormId = String(formData.get("revisitFormId") ?? "").trim() || null;
  const outsideSampleFormId = String(formData.get("outsideSampleFormId") ?? "").trim() || null;
  const dateFrom = String(formData.get("dateFrom") ?? "");
  const dateTo = String(formData.get("dateTo") ?? "");
  const expectedHhPerCluster = parseInt(String(formData.get("expectedHhPerCluster") ?? "15"), 10);
  const targetSampleSizeRaw = String(formData.get("targetSampleSize") ?? "").trim();
  const targetSampleSize = targetSampleSizeRaw ? parseInt(targetSampleSizeRaw, 10) : null;
  const clusterCsvFile = formData.get("clusterCsv") as File | null;

  if (!name || !odkBaseUrl || !mainFormId || !dateFrom || !dateTo || Number.isNaN(odkProjectId)) {
    throw new Error("Missing required fields.");
  }

  const [config] = await db
    .insert(surveyConfigs)
    .values({
      name,
      odkBaseUrl,
      odkProjectId,
      mainFormId,
      revisitFormId,
      outsideSampleFormId,
      dateFrom,
      dateTo,
      expectedHhPerCluster: Number.isNaN(expectedHhPerCluster) ? 15 : expectedHhPerCluster,
      targetSampleSize: targetSampleSize && !Number.isNaN(targetSampleSize) ? targetSampleSize : null,
      createdBy: userId,
    })
    .returning();

  if (clusterCsvFile && clusterCsvFile.size > 0) {
    const text = await clusterCsvFile.text();
    await importClusterCsv(config.id, text);
  }

  revalidatePath("/");
  redirect(`/survey/${config.id}`);
}

export async function updateSurveyConfig(surveyConfigId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const odkBaseUrl = String(formData.get("odkBaseUrl") ?? "").trim();
  const odkProjectId = parseInt(String(formData.get("odkProjectId") ?? ""), 10);
  const mainFormId = String(formData.get("mainFormId") ?? "").trim();
  const revisitFormId = String(formData.get("revisitFormId") ?? "").trim() || null;
  const outsideSampleFormId = String(formData.get("outsideSampleFormId") ?? "").trim() || null;
  const dateFrom = String(formData.get("dateFrom") ?? "");
  const dateTo = String(formData.get("dateTo") ?? "");
  const expectedHhPerCluster = parseInt(String(formData.get("expectedHhPerCluster") ?? "15"), 10);
  const targetSampleSizeRaw = String(formData.get("targetSampleSize") ?? "").trim();
  const targetSampleSize = targetSampleSizeRaw ? parseInt(targetSampleSizeRaw, 10) : null;
  const clusterCsvFile = formData.get("clusterCsv") as File | null;

  if (!name || !odkBaseUrl || !mainFormId || !dateFrom || !dateTo || Number.isNaN(odkProjectId)) {
    throw new Error("Missing required fields.");
  }

  await db
    .update(surveyConfigs)
    .set({
      name,
      odkBaseUrl,
      odkProjectId,
      mainFormId,
      revisitFormId,
      outsideSampleFormId,
      dateFrom,
      dateTo,
      expectedHhPerCluster: Number.isNaN(expectedHhPerCluster) ? 15 : expectedHhPerCluster,
      targetSampleSize: targetSampleSize && !Number.isNaN(targetSampleSize) ? targetSampleSize : null,
    })
    .where(eq(surveyConfigs.id, surveyConfigId));

  if (clusterCsvFile && clusterCsvFile.size > 0) {
    const text = await clusterCsvFile.text();
    await importClusterCsv(surveyConfigId, text);
  }

  revalidatePath("/");
  revalidatePath(`/survey/${surveyConfigId}`, "layout");
  redirect(`/survey/${surveyConfigId}`);
}

export async function updateTargetSampleSize(surveyConfigId: string, formData: FormData) {
  const raw = String(formData.get("targetSampleSize") ?? "").trim();
  const targetSampleSize = raw ? parseInt(raw, 10) : null;
  await db
    .update(surveyConfigs)
    .set({ targetSampleSize: targetSampleSize && !Number.isNaN(targetSampleSize) ? targetSampleSize : null })
    .where(eq(surveyConfigs.id, surveyConfigId));
  revalidatePath(`/survey/${surveyConfigId}`);
}

export async function importClusterCsv(surveyConfigId: string, csvText: string) {
  const rows = parseClusterCsv(csvText);

  await db.delete(clusterAssignments).where(eq(clusterAssignments.surveyConfigId, surveyConfigId));

  if (rows.length === 0) return;

  await db.insert(clusterAssignments).values(
    rows.map((r) => ({
      surveyConfigId,
      surveyDate: r.surveyDate,
      teamNumber: r.teamNumber,
      settlementName: r.settlementName,
      clusterNumber: r.clusterNumber,
      site: r.site,
      settlement: r.settlement,
    })),
  );

  revalidatePath(`/survey/${surveyConfigId}`);
}
