import { deepGet, toNumberLike, toStringLike } from "@/server/odk/deep-get";
import { CHILD_PATHS, DEATH_LIST_PATHS, LEFT_LIST_PATHS, MEMBER_PATHS, SYSTEM_PATHS } from "./field-paths";
import { resolveMemberAgeYears } from "./age";

export type HouseholdMemberRecord = {
  memberOdkKey: string;
  householdOdkId: string;
  source: "current" | "left" | "death";
  sex: string | null;
  ageYears: number | null;
  joinFlag: "y" | "n" | null;
  bornFlag: "y" | "n";
  leftFlag: "y" | "n";
  diedFlag: "y" | "n";
  dCause: string | null;
  raw: Record<string, unknown>;
};

/**
 * Port of the household-members half of `process_mortality_members` in
 * smart_functions.py -- ALL members of the household (not filtered to
 * present 0-59mo children like `extractChild`), used only to compute the
 * "sample size achieved" progress metric. Returns null for rows that should
 * be excluded (the `q2_2 == '1000'` sentinel, or an implausible age).
 */
export function extractHouseholdMemberCurrent(
  raw: Record<string, unknown>,
  surveyDate: string,
): HouseholdMemberRecord | null {
  const memberName = toStringLike(deepGet(raw, CHILD_PATHS.memberName));
  if (memberName === "1000") return null;

  const reportedAgeYears = toNumberLike(deepGet(raw, MEMBER_PATHS.ageYears));
  if (reportedAgeYears !== null && reportedAgeYears >= 150) return null;

  // Prefer a birthdate-derived age in years over the form's own reported
  // age_years, matching process_mortality_members -- this feeds both the
  // u5 filter and the join/left/born/died classification for the
  // sample-size-achieved metric, so it must agree with the notebook.
  const birthdateRaw = toStringLike(deepGet(raw, CHILD_PATHS.birthdate));
  const ageYears = resolveMemberAgeYears(reportedAgeYears, birthdateRaw, surveyDate);

  const ageMonths = toNumberLike(deepGet(raw, CHILD_PATHS.reportedAgeMonths));
  const born: "y" | "n" = ageMonths !== null && ageMonths < 12 ? "y" : "n";

  const joinRaw = toStringLike(deepGet(raw, MEMBER_PATHS.join));
  const join: "y" | "n" | null = joinRaw === "y" && born === "y" ? "n" : (joinRaw as "y" | "n" | null);

  return {
    memberOdkKey: toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "",
    householdOdkId: toStringLike(deepGet(raw, SYSTEM_PATHS.parentSubmissionId)) ?? "",
    source: "current",
    sex: toStringLike(deepGet(raw, CHILD_PATHS.sex1)),
    ageYears,
    joinFlag: join,
    bornFlag: born,
    leftFlag: "n",
    diedFlag: "n",
    dCause: null,
    raw,
  };
}

export function extractHouseholdMemberLeft(raw: Record<string, unknown>): HouseholdMemberRecord {
  const ageYears = toNumberLike(deepGet(raw, LEFT_LIST_PATHS.ageLeft));
  const born: "y" | "n" = ageYears !== null && ageYears < 1 ? "y" : "n";

  return {
    memberOdkKey: toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "",
    householdOdkId: toStringLike(deepGet(raw, SYSTEM_PATHS.parentSubmissionId)) ?? "",
    source: "left",
    sex: toStringLike(deepGet(raw, LEFT_LIST_PATHS.sexLeft)),
    ageYears,
    joinFlag: null,
    bornFlag: born,
    leftFlag: "y",
    diedFlag: "n",
    dCause: null,
    raw,
  };
}

export function extractHouseholdMemberDeath(raw: Record<string, unknown>): HouseholdMemberRecord {
  const ageYears = toNumberLike(deepGet(raw, DEATH_LIST_PATHS.ageDied));
  const born: "y" | "n" = ageYears !== null && ageYears < 1 ? "y" : "n";

  return {
    memberOdkKey: toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "",
    householdOdkId: toStringLike(deepGet(raw, SYSTEM_PATHS.parentSubmissionId)) ?? "",
    source: "death",
    sex: toStringLike(deepGet(raw, DEATH_LIST_PATHS.sexDeath)),
    ageYears,
    joinFlag: null,
    bornFlag: born,
    leftFlag: "n",
    diedFlag: "y",
    dCause: toStringLike(deepGet(raw, DEATH_LIST_PATHS.causeDeath)),
    raw,
  };
}
