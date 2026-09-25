import { deepGet, toBoolLike, toNumberLike, toStringLike } from "@/server/odk/deep-get";
import { CHILD_PATHS, SYSTEM_PATHS } from "./field-paths";
import { resolveChildAgeDays, resolveChildAgeMonths } from "./age";
import { muacCmToMm, cleanAnthropometricSentinels, isImplausibleAnthropometry } from "./anthro-cleaning";
import { getAnthro, type Sex } from "@/server/who-growth-standards/zscore";
import { lookupWfhCutoff } from "@/server/who-growth-standards/wfh-cutoffs";
import type { ChildRecord } from "./types";

function normalizeSex(raw: string | null): Sex | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "male" || s === "m" || s === "1") return "male";
  if (s === "female" || s === "f" || s === "2") return "female";
  return null;
}

function normalizeHlYn(directionOfMeasure: string | null): "h" | "l" | null {
  if (!directionOfMeasure) return null;
  const s = directionOfMeasure.trim().toLowerCase();
  if (s === "height" || s === "h") return "h";
  if (s === "length" || s === "l") return "l";
  return null;
}

function boolToYn(value: boolean | null): "y" | "n" | null {
  if (value === null) return null;
  return value ? "y" : "n";
}

/**
 * Builds one normalized, cleaned ChildRecord from a raw
 * "Submissions.not_absent_hh.smart_survey.members" repeat record, or `null`
 * if this member isn't a present, 0-59-month child (mirrors the notebook's
 * `q2_3 == '1'`, `member_present == 'true'`, `age < 60`, and the `q2_2 ==
 * '1000'` sentinel-entry exclusion).
 */
export function extractChild(
  raw: Record<string, unknown>,
  surveyDate: string,
  household: { teamNumber: number | null; clusterNumber: string | null; hhId: number | null },
): ChildRecord | null {
  const memberName = toStringLike(deepGet(raw, CHILD_PATHS.memberName));
  if (memberName === "1000") return null;

  const ageGroupCode = toStringLike(deepGet(raw, CHILD_PATHS.ageGroupCode));
  if (ageGroupCode !== "1") return null;

  const memberPresent = toBoolLike(deepGet(raw, CHILD_PATHS.memberPresent));
  if (memberPresent !== true) return null;

  // Inclusion (present, <60mo) is decided on the RAW reported age, matching
  // the notebook's `df_final['age'].astype(int)<60` filter -- which runs
  // BEFORE `plausibility_format`'s birthdate-based age recalculation, not
  // after. Only children who pass that raw-age cut get their age refined
  // from birthdate for the actual measurements below; a child whose
  // birthdate-derived age disagrees with the reported age near the 59/60
  // boundary is included/excluded based on what was reported, same as the
  // notebook, not on the cleaned-up value.
  const birthdateRaw = toStringLike(deepGet(raw, CHILD_PATHS.birthdate));
  const reportedAge = toNumberLike(deepGet(raw, CHILD_PATHS.reportedAgeMonths));
  if (reportedAge === null || reportedAge >= 60) return null;

  const ageMonths = resolveChildAgeMonths(reportedAge, birthdateRaw, surveyDate);
  if (ageMonths === null) return null;

  const sex = normalizeSex(toStringLike(deepGet(raw, CHILD_PATHS.sex1)));
  const hlYn = normalizeHlYn(toStringLike(deepGet(raw, CHILD_PATHS.directionOfMeasure)));
  const weightKgRaw = toNumberLike(deepGet(raw, CHILD_PATHS.weightKg));
  const heightCmRaw = toNumberLike(deepGet(raw, CHILD_PATHS.finalHeightCm));
  const muacCm = toNumberLike(deepGet(raw, CHILD_PATHS.muacCm));
  const muacMmRaw = muacCm !== null ? muacCmToMm(muacCm) : null;

  const cleaned = cleanAnthropometricSentinels({
    heightCm: heightCmRaw,
    weightKg: weightKgRaw,
    muacMm: muacMmRaw,
  });
  const droppedAsImplausible = isImplausibleAnthropometry(cleaned);

  let whz: number | null = null;
  let waz: number | null = null;
  let haz: number | null = null;
  let malnStatus: string | null = null;

  if (
    !droppedAsImplausible &&
    sex !== null &&
    cleaned.weightKg !== null &&
    cleaned.heightCm !== null
  ) {
    const ageDays = resolveChildAgeDays(birthdateRaw, surveyDate);
    const anthro = getAnthro(
      sex,
      ageMonths,
      cleaned.weightKg,
      cleaned.heightCm,
      hlYn ?? "h",
      lookupWfhCutoff,
      ageDays ?? undefined,
    );
    whz = anthro.whz;
    waz = anthro.waz;
    haz = anthro.haz;
    malnStatus = anthro.status;
  }

  const flags: string[] = [];
  if (droppedAsImplausible) flags.push("implausible_measurement");
  if (toBoolLike(deepGet(raw, CHILD_PATHS.wfhPos5Warn)) === true) flags.push("wfh_pos5_warn");
  if (toBoolLike(deepGet(raw, CHILD_PATHS.wfhNeg5Warn)) === true) flags.push("wfh_neg5_warn");
  if (toBoolLike(deepGet(raw, CHILD_PATHS.weightExt)) === true) flags.push("weight_ext");
  if (toBoolLike(deepGet(raw, CHILD_PATHS.hlExt)) === true) flags.push("hl_ext");
  if (toBoolLike(deepGet(raw, CHILD_PATHS.muacExt)) === true) flags.push("muac_ext");
  if (toBoolLike(deepGet(raw, CHILD_PATHS.cOedema)) === true) flags.push("oedema");
  // App-computed, not a form warning: MUAC >= 20cm (200mm) is unusually
  // large for a 0-59mo child -- worth a second look even though it's below
  // the 264mm hard-implausible cutoff that would drop the record entirely.
  if (cleaned.muacMm !== null && cleaned.muacMm >= 200) flags.push("muac_ge_20cm");

  const referralTf = toBoolLike(deepGet(raw, CHILD_PATHS.referralTf));
  const referralNumber = toStringLike(deepGet(raw, CHILD_PATHS.referralNumber));
  const referralNumber2 = toStringLike(deepGet(raw, CHILD_PATHS.referralNumber2));
  if (referralTf === true && referralNumber !== referralNumber2) {
    flags.push("referral_number_mismatch");
  }

  return {
    odkChildKey: toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "",
    householdOdkId: toStringLike(deepGet(raw, SYSTEM_PATHS.parentSubmissionId)) ?? "",
    surveyDate,
    teamNumber: household.teamNumber,
    clusterNumber: household.clusterNumber,
    hhId: household.hhId,
    childId: null, // assigned sequentially once the full dataset is sorted
    sex,
    birthdate: birthdateRaw,
    ageMonths,
    weightKg: cleaned.weightKg,
    heightCm: cleaned.heightCm,
    hlYn,
    muacMm: cleaned.muacMm,
    oedema: boolToYn(toBoolLike(deepGet(raw, CHILD_PATHS.cOedema))),
    cmamEnrollment: boolToYn(toBoolLike(deepGet(raw, CHILD_PATHS.cmamEnrollmentTf))),
    whz,
    waz,
    haz,
    malnStatus,
    droppedAsImplausible,
    flags,
    raw,
  };
}

/** Assigns sequential child ids after sorting by (surveyDate, teamNumber, hhId),
 * matching the notebook's `df_final.sort_values(...); df_final['child_id'] = range(1, ...)`. */
export function assignChildIds(children: ChildRecord[]): ChildRecord[] {
  const sorted = [...children].sort((a, b) => {
    if (a.surveyDate !== b.surveyDate) return a.surveyDate < b.surveyDate ? -1 : 1;
    const teamA = a.teamNumber ?? 0;
    const teamB = b.teamNumber ?? 0;
    if (teamA !== teamB) return teamA - teamB;
    return (a.hhId ?? 0) - (b.hhId ?? 0);
  });
  return sorted.map((c, i) => ({ ...c, childId: i + 1 }));
}
