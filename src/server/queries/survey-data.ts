import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  children,
  households,
  householdMembers,
  outsideChildren,
  pregnancyBirths,
  clusterAssignments,
  manualCorrections,
  manualExclusions,
} from "@/server/db/schema";
import type { ChildRecord, HouseholdRecord } from "@/server/pipeline/types";
import type { HouseholdMemberRecord } from "@/server/pipeline/extract-household-member";
import type { OutsideChildRecord } from "@/server/pipeline/extract-outside-child";
import type { PregnancyBirthRecord } from "@/server/pipeline/extract-pregnancy-birth";
import { mergeClusterNumbers } from "@/server/pipeline/cluster-merge";
import { applyChildCorrections, applyHouseholdCorrections, type ManualCorrection } from "@/server/pipeline/apply-corrections";

async function loadManualCorrections(surveyConfigId: string): Promise<ManualCorrection[]> {
  const rows = await db.query.manualCorrections.findMany({
    where: eq(manualCorrections.surveyConfigId, surveyConfigId),
  });
  return rows.map((r) => ({
    id: r.id,
    targetOdkId: r.targetOdkId,
    fieldName: r.fieldName,
    correctedValue: r.correctedValue,
  }));
}

async function loadExcludedOdkIds(surveyConfigId: string): Promise<Set<string>> {
  const rows = await db.query.manualExclusions.findMany({
    where: eq(manualExclusions.surveyConfigId, surveyConfigId),
  });
  return new Set(rows.map((r) => r.targetOdkId));
}

async function loadHouseholdsRaw(surveyConfigId: string): Promise<HouseholdRecord[]> {
  const rows = await db.query.households.findMany({ where: eq(households.surveyConfigId, surveyConfigId) });
  return rows.map((r) => ({
    odkId: r.odkId,
    formId: r.formId,
    surveyDate: r.surveyDate,
    deviceId: r.deviceId,
    teamNumber: r.teamNumber,
    otpName: r.otpName,
    settlementName: r.settlementName,
    clusterNumber: r.clusterNumber,
    hhId: r.hhId,
    startTime: r.startTime ? r.startTime.toISOString() : null,
    endTime: r.endTime ? r.endTime.toISOString() : null,
    hasGeopoint: r.hasGeopoint,
    consent: r.consent,
    absentHh: r.absentHh,
    firstVisit: r.firstVisit,
    flags: r.flags,
    raw: r.raw as Record<string, unknown>,
  }));
}

/**
 * Households with manual corrections (team_number/otp_name/settlement_name/
 * hh_id) applied on top, and cluster_number re-derived from the (possibly
 * corrected) team_number/settlement_name -- so a manual fix is reflected
 * consistently everywhere, the same way `get_survey_mode` corrections were.
 */
export async function loadHouseholds(surveyConfigId: string): Promise<HouseholdRecord[]> {
  const [raw, corrections, excluded, clusterRows] = await Promise.all([
    loadHouseholdsRaw(surveyConfigId),
    loadManualCorrections(surveyConfigId),
    loadExcludedOdkIds(surveyConfigId),
    db.query.clusterAssignments.findMany({ where: eq(clusterAssignments.surveyConfigId, surveyConfigId) }),
  ]);

  const kept = raw.filter((h) => !excluded.has(h.odkId));
  const corrected = applyHouseholdCorrections(kept, corrections);
  return mergeClusterNumbers(
    corrected,
    clusterRows.map((c) => ({
      surveyDate: c.surveyDate,
      teamNumber: c.teamNumber,
      settlementName: c.settlementName,
      clusterNumber: c.clusterNumber,
      site: c.site,
      settlement: c.settlement,
    })),
  );
}

async function loadChildrenRaw(surveyConfigId: string): Promise<ChildRecord[]> {
  const rows = await db.query.children.findMany({ where: eq(children.surveyConfigId, surveyConfigId) });
  return rows.map((r) => ({
    odkChildKey: r.odkChildKey,
    householdOdkId: r.householdOdkId,
    surveyDate: r.surveyDate,
    teamNumber: r.teamNumber,
    clusterNumber: r.clusterNumber,
    hhId: r.hhId,
    childId: r.childId,
    sex: r.sex as ChildRecord["sex"],
    birthdate: r.birthdate,
    ageMonths: r.ageMonths,
    weightKg: r.weightKg,
    heightCm: r.heightCm,
    hlYn: r.hlYn as ChildRecord["hlYn"],
    muacMm: r.muacMm,
    oedema: r.oedema as ChildRecord["oedema"],
    cmamEnrollment: r.cmamEnrollment as ChildRecord["cmamEnrollment"],
    whz: r.whz,
    waz: r.waz,
    haz: r.haz,
    malnStatus: r.malnStatus,
    droppedAsImplausible: r.droppedAsImplausible,
    flags: r.flags,
    raw: r.raw as Record<string, unknown>,
  }));
}

/**
 * Children with manual corrections applied. Team number/cluster number/
 * hh_id are cascaded down from the (corrected) household -- mirroring how
 * `df_final` inherits identification fields from `df_id` -- so a household
 * correction doesn't need to be entered twice. Direct child-level
 * corrections (sex/birthdate/age/weight/height/MUAC) are applied on top,
 * and WHZ/WAZ/HAZ/malnStatus are recomputed when any anthropometric input
 * changes.
 */
export async function loadChildren(surveyConfigId: string): Promise<ChildRecord[]> {
  const [raw, corrections, excluded, correctedHouseholds] = await Promise.all([
    loadChildrenRaw(surveyConfigId),
    loadManualCorrections(surveyConfigId),
    loadExcludedOdkIds(surveyConfigId),
    loadHouseholds(surveyConfigId),
  ]);

  // Excluding a household also excludes its children.
  const kept = raw.filter((c) => !excluded.has(c.odkChildKey) && !excluded.has(c.householdOdkId));

  const householdByOdkId = new Map(correctedHouseholds.map((h) => [h.odkId, h]));
  const cascaded = kept.map((c) => {
    const household = householdByOdkId.get(c.householdOdkId);
    if (!household) return c;
    return {
      ...c,
      teamNumber: household.teamNumber,
      clusterNumber: household.clusterNumber,
      hhId: household.hhId,
    };
  });

  return applyChildCorrections(cascaded, corrections);
}

export function listSurveyDatesDesc(households: HouseholdRecord[]): string[] {
  return [...new Set(households.map((h) => h.surveyDate))].sort((a, b) => (a < b ? 1 : -1));
}

/** Number of distinct clusters in the uploaded cluster-assignment sheet --
 * the survey's design target, not how many have been visited so far (that's
 * `computeClusterCount` over the measured children). */
export async function countTargetClusters(surveyConfigId: string): Promise<number> {
  const rows = await db.query.clusterAssignments.findMany({
    where: eq(clusterAssignments.surveyConfigId, surveyConfigId),
    columns: { clusterNumber: true },
  });
  return new Set(rows.map((r) => r.clusterNumber)).size;
}

export async function loadHouseholdMembers(surveyConfigId: string): Promise<HouseholdMemberRecord[]> {
  const rows = await db.query.householdMembers.findMany({
    where: eq(householdMembers.surveyConfigId, surveyConfigId),
  });
  return rows.map((r) => ({
    memberOdkKey: r.memberOdkKey,
    householdOdkId: r.householdOdkId,
    source: r.source,
    sex: r.sex,
    ageYears: r.ageYears,
    joinFlag: r.joinFlag as "y" | "n" | null,
    bornFlag: r.bornFlag as "y" | "n",
    leftFlag: r.leftFlag as "y" | "n",
    diedFlag: r.diedFlag as "y" | "n",
    dCause: r.dCause,
    raw: r.raw as Record<string, unknown>,
  }));
}

export async function loadPregnancyBirths(surveyConfigId: string): Promise<PregnancyBirthRecord[]> {
  const rows = await db.query.pregnancyBirths.findMany({
    where: eq(pregnancyBirths.surveyConfigId, surveyConfigId),
  });
  return rows.map((r) => ({
    odkKey: r.odkKey,
    householdOdkId: r.householdOdkId,
    position: r.position,
    outcome: r.outcome,
    raw: r.raw as Record<string, unknown>,
  }));
}

export async function loadOutsideChildren(surveyConfigId: string): Promise<OutsideChildRecord[]> {
  const rows = await db.query.outsideChildren.findMany({
    where: eq(outsideChildren.surveyConfigId, surveyConfigId),
  });
  return rows.map((r) => ({
    odkId: r.odkId,
    formId: r.formId,
    surveyDate: r.surveyDate,
    teamNumber: r.teamNumber,
    otpName: r.otpName,
    settlementName: r.settlementName,
    raw: r.raw as Record<string, unknown>,
  }));
}
