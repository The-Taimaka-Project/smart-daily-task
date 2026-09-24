/**
 * "Log of Typo" -- replaces the manual workflow of running the plausibility
 * check in ENA, noting which rows it flagged as "likely in error", and
 * copying them into a Log of Typos spreadsheet for a teammate to check.
 *
 * Flagging reuses the exact same WHO fixed-range + SMART observed-mean
 * +/-3SD logic as the plausibility report (src/server/pipeline/plausibility-flags.ts)
 * applied to WHZ, HAZ, and WAZ individually.
 *
 * The `explanation` heuristic below is this app's own reasoning, NOT a
 * reverse-engineered copy of ENA's (undocumented, closed-source) internal
 * logic -- it's a defensible rule based on which anthropometric index a
 * z-score is a function of:
 *   WHZ = f(weight, height)   HAZ = f(height, age)   WAZ = f(weight, age)
 * When two indices are flagged together, the variable they share is the
 * most likely single cause. When only one is flagged, both of its inputs
 * are named as candidates, with a direction hint from the sign of z. A
 * human always reviews the actual values before correcting anything.
 */
import type { ChildRecord } from "./types";
import { smartFlags, whoFlag } from "./plausibility-flags";

export type FlaggedIndex = { index: "WHZ" | "HAZ" | "WAZ"; z: number };

export type TypoLogRow = {
  targetOdkId: string;
  householdOdkId: string;
  surveyDate: string;
  teamNumber: number | null;
  hhId: number | null;
  childId: number | null;
  childName: string | null;
  flaggedIndices: FlaggedIndex[];
  explanation: string;
  birthdate: string | null;
  ageMonths: number | null;
  weightKg: number | null;
  heightCm: number | null;
  muacMm: number | null;
  // True for every row this function produces (it only ever looks at
  // currently-flagged children) -- the caller in typo-log/page.tsx sets
  // this to false when it re-adds a row for a child that was flagged
  // before but no longer is, so a corrected typo stays in the log as a
  // resolved entry instead of silently disappearing.
  stillFlagged: boolean;
};

function directionWord(z: number, ifNegative: string, ifPositive: string): string {
  return z < 0 ? ifNegative : ifPositive;
}

function explain(flags: FlaggedIndex[]): string {
  const has = (i: FlaggedIndex["index"]) => flags.find((f) => f.index === i);
  const whz = has("WHZ");
  const haz = has("HAZ");
  const waz = has("WAZ");

  // Two (or three) indices flagged: the variable they share is the prime suspect.
  if (haz && waz && !whz) {
    return `Age may be incorrect -- child may be ${directionWord(haz.z, "younger", "older")} than recorded (HAZ and WAZ both off, age is what they share).`;
  }
  if (whz && haz && !waz) {
    return `Height/length may be incorrect -- likely ${directionWord(whz.z, "over-measured (too tall for the recorded weight)", "under-measured (too short for the recorded weight)")} (WHZ and HAZ both off, height is what they share).`;
  }
  if (whz && waz && !haz) {
    return `Weight may be incorrect -- likely ${directionWord(whz.z, "under-measured", "over-measured")} (WHZ and WAZ both off, weight is what they share).`;
  }
  if (whz && haz && waz) {
    return "Age, weight, and height are all implicated (all three z-scores flagged) -- check the whole row carefully.";
  }

  // Only one index flagged: name both of its inputs as candidates.
  if (haz) {
    return `HAZ is extreme (z=${haz.z.toFixed(2)}) -- age or height may be off. Child may be ${directionWord(haz.z, "younger than recorded, or height was under-measured", "older than recorded, or height was over-measured")}.`;
  }
  if (waz) {
    return `WAZ is extreme (z=${waz.z.toFixed(2)}) -- age or weight may be off. Child may be ${directionWord(waz.z, "younger than recorded, or weight was under-measured", "older than recorded, or weight was over-measured")}.`;
  }
  if (whz) {
    return `WHZ is extreme (z=${whz.z.toFixed(2)}) -- weight or height may be off: weight ${directionWord(whz.z, "under-measured", "over-measured")}, or height ${directionWord(whz.z, "over-measured", "under-measured")}.`;
  }
  return "";
}

/** Children whose WHZ, HAZ, or WAZ is flagged (WHO fixed-range, then SMART
 * observed-mean +/-3SD on the survey's own cohort). Excludes children
 * already dropped as implausible (they have no z-scores to flag). */
export function computeTypoLogRows(children: ChildRecord[]): TypoLogRow[] {
  const cohort = children.filter((c) => !c.droppedAsImplausible);

  const flagOne = (kind: "WHZ" | "HAZ" | "WAZ", values: (number | null)[]): boolean[] => {
    const afterWho = values.map((z) => (z !== null && whoFlag(z, kind) ? null : z));
    return smartFlags(afterWho);
  };

  const whzFlagged = flagOne("WHZ", cohort.map((c) => c.whz));
  const hazFlagged = flagOne("HAZ", cohort.map((c) => c.haz));
  const wazFlagged = flagOne("WAZ", cohort.map((c) => c.waz));

  const rows: TypoLogRow[] = [];
  cohort.forEach((c, i) => {
    const flaggedIndices: FlaggedIndex[] = [];
    if (whzFlagged[i] && c.whz !== null) flaggedIndices.push({ index: "WHZ", z: c.whz });
    if (hazFlagged[i] && c.haz !== null) flaggedIndices.push({ index: "HAZ", z: c.haz });
    if (wazFlagged[i] && c.waz !== null) flaggedIndices.push({ index: "WAZ", z: c.waz });
    if (flaggedIndices.length === 0) return;

    rows.push({
      targetOdkId: c.odkChildKey,
      householdOdkId: c.householdOdkId,
      surveyDate: c.surveyDate,
      teamNumber: c.teamNumber,
      hhId: c.hhId,
      childId: c.childId,
      childName: null, // filled in by the caller from raw, see field-paths CHILD_PATHS.memberName
      flaggedIndices,
      explanation: explain(flaggedIndices),
      birthdate: c.birthdate,
      ageMonths: c.ageMonths,
      weightKg: c.weightKg,
      heightCm: c.heightCm,
      muacMm: c.muacMm,
      stillFlagged: true,
    });
  });

  return rows.sort((a, b) => (a.surveyDate < b.surveyDate ? -1 : a.surveyDate > b.surveyDate ? 1 : 0));
}
