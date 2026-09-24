import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  children,
  clusterAssignments,
  households,
  householdMembers,
  outsideChildren,
  pregnancyBirths,
  pullJobs,
  surveyConfigs,
} from "@/server/db/schema";
import { downloadSubmissionsZip, type OdkSession } from "@/server/odk/client";
import { parseSubmissionsZip, csvRowToRaw } from "./csv-import";
import { extractHousehold, excludeCourtesyHouseholds, filterRawByTodayDateRange } from "./extract-household";
import { extractChild, assignChildIds } from "./extract-child";
import {
  extractHouseholdMemberCurrent,
  extractHouseholdMemberDeath,
  extractHouseholdMemberLeft,
  type HouseholdMemberRecord,
} from "./extract-household-member";
import { extractOutsideChild } from "./extract-outside-child";
import { extractPregnancyBirth, type PregnancyBirthRecord } from "./extract-pregnancy-birth";
import { applySurveyMode } from "./survey-mode";
import { mergeClusterNumbers } from "./cluster-merge";
import type { ClusterAssignmentRow, HouseholdRecord } from "./types";

async function loadClusterAssignments(surveyConfigId: string): Promise<ClusterAssignmentRow[]> {
  const rows = await db.query.clusterAssignments.findMany({
    where: eq(clusterAssignments.surveyConfigId, surveyConfigId),
  });
  return rows.map((r) => ({
    surveyDate: r.surveyDate,
    teamNumber: r.teamNumber,
    settlementName: r.settlementName,
    clusterNumber: r.clusterNumber,
    site: r.site,
    settlement: r.settlement,
  }));
}

/**
 * Downloads and parses ODK Central's bulk CSV/ZIP export for one form --
 * the root submissions table plus every repeat group, all in one request.
 *
 * This replaced the paginated OData JSON API (still in src/server/odk/client.ts
 * as `getOdkTable`, kept for the ODK-login/form-list flows) after that
 * repeatedly hung or errored specifically on the "members" repeat table --
 * confirmed independent of client implementation (a hand-rolled HTTP/2
 * client and undici's separate one both stalled at the same point).
 * Measured directly against the real server: this endpoint downloaded a
 * form's ENTIRE history (10,677 submissions, every repeat table) as one
 * ~2.7MB zip in under 40 seconds, where the paginated approach could take
 * many minutes per page and never reliably finish "members" at all.
 */
async function pullFormExport(
  session: OdkSession,
  projectId: number,
  formId: string,
): Promise<Map<string, Record<string, string>[]>> {
  const zipBuffer = await downloadSubmissionsZip(session, projectId, formId);
  return parseSubmissionsZip(zipBuffer);
}

/** Root submissions table rows for `formId`, converted from CSV's flat
 * "-"-joined columns back into the nested-object shape extract-*.ts
 * expects (see csv-import.ts). ODK Central names this entry exactly the
 * form id (e.g. "smart_round3"), confirmed against a real export. */
function rootRows(tables: Map<string, Record<string, string>[]>, formId: string): Record<string, unknown>[] {
  return (tables.get(formId) ?? []).map(csvRowToRaw);
}

/** One repeat group's rows for `formId` (e.g. "members", "left_list") --
 * ODK Central names this entry "<formId>-<repeatGroupName>", using just
 * the group's own terminal name regardless of how deeply nested it is in
 * the form (confirmed against a real export: the
 * "not_absent_hh.smart_survey.deathgrp.death_list" OData path becomes the
 * flat CSV name "smart_round3-death_list"). */
function repeatRows(
  tables: Map<string, Record<string, string>[]>,
  formId: string,
  repeatGroupName: string,
): Record<string, unknown>[] {
  return (tables.get(`${formId}-${repeatGroupName}`) ?? []).map(csvRowToRaw);
}

/**
 * The revisit form's "members" repeat group collects the same data as the
 * main form's but nests it differently -- confirmed directly against a
 * real export, not assumed. What's a top-level sibling of "age_validg" in
 * the main form (member_present, sex1, join, and the whole
 * member_present_group subtree that CHILD_PATHS's anthropometry fields all
 * live under) is nested INSIDE age_validg in the revisit form instead,
 * while birthdate/age (nested under age_validg in the main form) are
 * top-level there. The revisit form also has no "q2_3" gate question at
 * all -- every revisit member is, by the form's own purpose, already a
 * previously-identified 0-59mo child -- and names the per-member
 * age-in-years field "u5age_years" instead of "age_years" (the field
 * MEMBER_PATHS.ageYears reads for the sample-size-achieved metric).
 * Reshaping a revisit row into the main form's shape here means
 * extractChild/extractHouseholdMemberCurrent need no revisit-specific
 * branching of their own.
 */
function reshapeRevisitMemberRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const ageValidg = (raw.age_validg as Record<string, unknown> | undefined) ?? {};
  const { member_present, sex1, join, member_present_group, ...restAgeValidg } = ageValidg;
  return {
    ...raw,
    q2_3: "1",
    member_present,
    sex1,
    join,
    member_present_group,
    age_years: raw.u5age_years,
    age_validg: {
      ...restAgeValidg,
      birthdate: raw.birthdate,
      age: raw.age,
    },
  };
}

/** Progress updates are best-effort UI feedback, not correctness-critical --
 * a failed write here shouldn't interrupt the pull itself. */
function reportProgress(pullJobId: string, text: string) {
  db.update(pullJobs)
    .set({ progress: text })
    .where(eq(pullJobs.id, pullJobId))
    .catch(() => {});
}

/**
 * A pull should reflect the CURRENT truth from ODK Central, not accumulate
 * history -- upserting alone never removes a row that's no longer part of
 * the latest pull. Confirmed as a real bug: switching this pipeline from
 * the paginated OData API to the bulk CSV export (see csv-import.ts)
 * changed how left_list/death_list rows are keyed, so every old
 * OData-era row silently stuck around forever instead of being replaced,
 * exactly doubling the left/death member counts and throwing off the
 * sample-size-achieved metric. Each persist function below now deletes
 * anything outside the current pull's key set before upserting, closing
 * that gap for good regardless of why a row might disappear (a key format
 * change like this one, a submission deleted upstream, a household no
 * longer meeting inclusion rules, etc). Skipped when the pull produced NO
 * keys at all, so a table this pull didn't touch (e.g. no outside-sample
 * form configured) isn't wiped out.
 */
async function persistHouseholds(surveyConfigId: string, pullJobId: string, records: HouseholdRecord[]) {
  const keys = records.map((h) => h.odkId);
  if (keys.length > 0) {
    await db
      .delete(households)
      .where(and(eq(households.surveyConfigId, surveyConfigId), notInArray(households.odkId, keys)));
  }
  for (const h of records) {
    const values = {
      surveyConfigId,
      pullJobId,
      odkId: h.odkId,
      formId: h.formId,
      surveyDate: h.surveyDate,
      teamNumber: h.teamNumber,
      otpName: h.otpName,
      settlementName: h.settlementName,
      clusterNumber: h.clusterNumber,
      hhId: h.hhId,
      deviceId: h.deviceId,
      startTime: h.startTime ? new Date(h.startTime) : null,
      endTime: h.endTime ? new Date(h.endTime) : null,
      hasGeopoint: h.hasGeopoint,
      consent: h.consent,
      absentHh: h.absentHh,
      firstVisit: h.firstVisit,
      flags: h.flags,
      raw: h.raw,
    };
    await db
      .insert(households)
      .values(values)
      .onConflictDoUpdate({ target: [households.surveyConfigId, households.odkId], set: values });
  }
}

async function persistChildren(surveyConfigId: string, pullJobId: string, records: ReturnType<typeof extractChild>[]) {
  const keys = records.filter((c): c is NonNullable<typeof c> => c !== null).map((c) => c.odkChildKey);
  if (keys.length > 0) {
    await db
      .delete(children)
      .where(and(eq(children.surveyConfigId, surveyConfigId), notInArray(children.odkChildKey, keys)));
  }
  for (const c of records) {
    if (!c) continue;
    const values = {
      surveyConfigId,
      pullJobId,
      householdOdkId: c.householdOdkId,
      odkChildKey: c.odkChildKey,
      childId: c.childId,
      surveyDate: c.surveyDate,
      teamNumber: c.teamNumber,
      clusterNumber: c.clusterNumber,
      hhId: c.hhId,
      sex: c.sex,
      birthdate: c.birthdate,
      ageMonths: c.ageMonths,
      weightKg: c.weightKg,
      heightCm: c.heightCm,
      hlYn: c.hlYn,
      muacMm: c.muacMm,
      oedema: c.oedema,
      cmamEnrollment: c.cmamEnrollment,
      whz: c.whz,
      waz: c.waz,
      haz: c.haz,
      malnStatus: c.malnStatus,
      droppedAsImplausible: c.droppedAsImplausible,
      flags: c.flags,
      raw: c.raw,
    };
    await db
      .insert(children)
      .values(values)
      .onConflictDoUpdate({ target: [children.surveyConfigId, children.odkChildKey], set: values });
  }
}

async function persistHouseholdMembers(surveyConfigId: string, pullJobId: string, records: HouseholdMemberRecord[]) {
  // Scoped to just the source(s) present in this call (this function is
  // called once for left+death together, once for current) -- otherwise
  // persisting one source would delete the other's already-saved rows.
  const keys = records.map((m) => m.memberOdkKey);
  const sources = [...new Set(records.map((m) => m.source))];
  if (keys.length > 0 && sources.length > 0) {
    await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.surveyConfigId, surveyConfigId),
          inArray(householdMembers.source, sources),
          notInArray(householdMembers.memberOdkKey, keys),
        ),
      );
  }
  for (const m of records) {
    const values = {
      surveyConfigId,
      pullJobId,
      householdOdkId: m.householdOdkId,
      memberOdkKey: m.memberOdkKey,
      source: m.source,
      sex: m.sex,
      ageYears: m.ageYears,
      joinFlag: m.joinFlag,
      bornFlag: m.bornFlag,
      leftFlag: m.leftFlag,
      diedFlag: m.diedFlag,
      dCause: m.dCause,
      raw: m.raw,
    };
    await db
      .insert(householdMembers)
      .values(values)
      .onConflictDoUpdate({ target: [householdMembers.surveyConfigId, householdMembers.memberOdkKey], set: values });
  }
}

async function persistPregnancyBirths(
  surveyConfigId: string,
  pullJobId: string,
  records: PregnancyBirthRecord[],
) {
  const keys = records.map((p) => p.odkKey);
  if (keys.length > 0) {
    await db
      .delete(pregnancyBirths)
      .where(and(eq(pregnancyBirths.surveyConfigId, surveyConfigId), notInArray(pregnancyBirths.odkKey, keys)));
  }
  for (const p of records) {
    const values = {
      surveyConfigId,
      pullJobId,
      householdOdkId: p.householdOdkId,
      odkKey: p.odkKey,
      position: p.position,
      outcome: p.outcome,
      raw: p.raw,
    };
    await db
      .insert(pregnancyBirths)
      .values(values)
      .onConflictDoUpdate({ target: [pregnancyBirths.surveyConfigId, pregnancyBirths.odkKey], set: values });
  }
}

async function persistOutsideChildren(
  surveyConfigId: string,
  pullJobId: string,
  records: ReturnType<typeof extractOutsideChild>[],
) {
  const keys = records.map((o) => o.odkId);
  if (keys.length > 0) {
    await db
      .delete(outsideChildren)
      .where(and(eq(outsideChildren.surveyConfigId, surveyConfigId), notInArray(outsideChildren.odkId, keys)));
  }
  for (const o of records) {
    const values = {
      surveyConfigId,
      pullJobId,
      odkId: o.odkId,
      formId: o.formId,
      surveyDate: o.surveyDate,
      teamNumber: o.teamNumber,
      otpName: o.otpName,
      settlementName: o.settlementName,
      raw: o.raw,
    };
    await db
      .insert(outsideChildren)
      .values(values)
      .onConflictDoUpdate({ target: [outsideChildren.surveyConfigId, outsideChildren.odkId], set: values });
  }
}

/**
 * Runs one full pull → clean → store cycle for a survey config. Meant to be
 * invoked as a detached background task from a route handler (see
 * src/app/api/survey-configs/[id]/pull/route.ts) -- this function itself
 * just does the work and updates the PullJob row as it progresses.
 *
 * The main form's export (households + members + left_list + death_list)
 * downloads as a single zip; the outside-sample form (a separate ODK form
 * entirely) is a separate, independently-isolated download, so a failure
 * there can't discard the main form's data or vice versa.
 */
export async function runPullJob(pullJobId: string, odkSession: OdkSession): Promise<void> {
  const job = await db.query.pullJobs.findFirst({ where: eq(pullJobs.id, pullJobId) });
  if (!job) throw new Error(`PullJob ${pullJobId} not found`);

  const config = await db.query.surveyConfigs.findFirst({
    where: eq(surveyConfigs.id, job.surveyConfigId),
  });
  if (!config) throw new Error(`SurveyConfig ${job.surveyConfigId} not found`);

  await db
    .update(pullJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(pullJobs.id, pullJobId));

  const warnings: string[] = [];

  try {
    // -- Main form export: required. A failure here fails the whole job,
    // same as households being required before. --
    reportProgress(pullJobId, `Downloading export for ${config.mainFormId}...`);
    const mainTables = await pullFormExport(odkSession, config.odkProjectId, config.mainFormId);

    reportProgress(pullJobId, "Export downloaded. Processing households...");
    let householdRecords = filterRawByTodayDateRange(
      rootRows(mainTables, config.mainFormId),
      config.dateFrom,
      config.dateTo,
    ).map((r) => extractHousehold(r, config.mainFormId));

    // Kept for the members pass below (revisit households have their own
    // "members" repeat table, same as the main form -- df_revisit in the
    // notebook merges revisit_repeats' members onto revisit households the
    // same way, and skipping that step was a real, confirmed gap: it
    // silently dropped every revisit-round child from this app entirely).
    let revisitTables: Map<string, Record<string, string>[]> | null = null;
    if (config.revisitFormId) {
      reportProgress(pullJobId, `Households done (${householdRecords.length}). Downloading revisit export...`);
      revisitTables = await pullFormExport(odkSession, config.odkProjectId, config.revisitFormId);
      const revisitHouseholds = filterRawByTodayDateRange(
        rootRows(revisitTables, config.revisitFormId),
        config.dateFrom,
        config.dateTo,
      ).map((r) => extractHousehold(r, config.revisitFormId!));
      householdRecords = [...householdRecords, ...revisitHouseholds];
    }

    householdRecords = excludeCourtesyHouseholds(householdRecords, config.expectedHhPerCluster);
    householdRecords = applySurveyMode(householdRecords);

    const clusters = await loadClusterAssignments(config.id);
    householdRecords = mergeClusterNumbers(householdRecords, clusters);

    const householdByOdkId = new Map(householdRecords.map((h) => [h.odkId, h]));

    reportProgress(pullJobId, `Households done (${householdRecords.length}). Saving...`);
    await persistHouseholds(config.id, pullJobId, householdRecords);

    // -- left_list / death_list: already in mainTables, no extra network
    // call -- just isolated per-table extraction in case of a data-shape
    // surprise in one of them. --
    reportProgress(pullJobId, "Processing left_list, death_list...");
    const leftDeathMembers: HouseholdMemberRecord[] = [];

    try {
      for (const raw of repeatRows(mainTables, config.mainFormId, "left_list")) {
        if (typeof raw["__Submissions-id"] === "string" && householdByOdkId.has(raw["__Submissions-id"])) {
          leftDeathMembers.push(extractHouseholdMemberLeft(raw));
        }
      }
    } catch (err) {
      warnings.push(`left_list: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      for (const raw of repeatRows(mainTables, config.mainFormId, "death_list")) {
        if (typeof raw["__Submissions-id"] === "string" && householdByOdkId.has(raw["__Submissions-id"])) {
          leftDeathMembers.push(extractHouseholdMemberDeath(raw));
        }
      }
    } catch (err) {
      warnings.push(`death_list: ${err instanceof Error ? err.message : String(err)}`);
    }

    await persistHouseholdMembers(config.id, pullJobId, leftDeathMembers);

    // -- preg_birth_list: also already in mainTables. Only the main form's
    // export was ever pulled for this in the notebook this was ported
    // from, so revisit-form households aren't covered here either. --
    reportProgress(pullJobId, "Processing preg_birth_list...");
    const pregnancyBirthRecords: PregnancyBirthRecord[] = [];
    try {
      for (const raw of repeatRows(mainTables, config.mainFormId, "preg_birth_list")) {
        if (typeof raw["__Submissions-id"] === "string" && householdByOdkId.has(raw["__Submissions-id"])) {
          pregnancyBirthRecords.push(extractPregnancyBirth(raw));
        }
      }
    } catch (err) {
      warnings.push(`preg_birth_list: ${err instanceof Error ? err.message : String(err)}`);
    }
    await persistPregnancyBirths(config.id, pullJobId, pregnancyBirthRecords);

    // -- outside_sample: a separate ODK form, so a separate export
    // download, isolated from the main form's data. --
    if (config.outsideSampleFormId) {
      try {
        reportProgress(pullJobId, `Downloading export for ${config.outsideSampleFormId}...`);
        const outsideTables = await pullFormExport(odkSession, config.odkProjectId, config.outsideSampleFormId);
        const outsideChildRecords = filterRawByTodayDateRange(
          rootRows(outsideTables, config.outsideSampleFormId),
          config.dateFrom,
          config.dateTo,
        ).map((r) => extractOutsideChild(r, config.outsideSampleFormId!));
        await persistOutsideChildren(config.id, pullJobId, outsideChildRecords);
      } catch (err) {
        warnings.push(`outside_sample: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // -- members: already downloaded above (mainTables, and revisitTables if
    // configured), no extra network call. This was the table that made the
    // paginated OData approach necessary in the first place -- now it's
    // just in-memory arrays from downloads that already happened. Main and
    // revisit members are combined into one set, matching the notebook's
    // `df_final = pd.concat([df_child, df_revisit], axis=0)`. --
    reportProgress(pullJobId, "Processing members (children + progress data)...");
    let childRecords: NonNullable<ReturnType<typeof extractChild>>[] = [];
    try {
      const rawMembers = [
        ...repeatRows(mainTables, config.mainFormId, "members"),
        ...(revisitTables
          ? repeatRows(revisitTables, config.revisitFormId!, "members").map(reshapeRevisitMemberRaw)
          : []),
      ];
      reportProgress(pullJobId, `Members: ${rawMembers.length} rows. Processing...`);

      const currentMembers: HouseholdMemberRecord[] = [];
      for (const raw of rawMembers) {
        const parentId = raw["__Submissions-id"];
        const household = typeof parentId === "string" ? householdByOdkId.get(parentId) : undefined;
        if (!household) continue;
        const child = extractChild(raw, household.surveyDate, household);
        if (child) childRecords.push(child);
        const member = extractHouseholdMemberCurrent(raw, household.surveyDate);
        if (member) currentMembers.push(member);
      }
      childRecords = assignChildIds(childRecords);
      await persistChildren(config.id, pullJobId, childRecords);
      await persistHouseholdMembers(config.id, pullJobId, currentMembers);
    } catch (err) {
      warnings.push(`members (children + progress data): ${err instanceof Error ? err.message : String(err)}`);
    }

    await db
      .update(pullJobs)
      .set({
        status: "success",
        progress: null,
        finishedAt: new Date(),
        householdCount: householdRecords.length,
        childCount: childRecords.length,
        errorMessage: warnings.length ? warnings.join(" | ") : null,
      })
      .where(eq(pullJobs.id, pullJobId));
  } catch (err) {
    await db
      .update(pullJobs)
      .set({
        status: "error",
        progress: null,
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(pullJobs.id, pullJobId));
    throw err;
  }
}
