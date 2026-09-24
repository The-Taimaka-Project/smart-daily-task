/**
 * Port of the age-calculation step in `plausibility_format`: when a
 * birthdate was recorded, age in months is (re)derived from
 * `(surveyDate - birthdate).days // 30.437`, overriding whatever age was
 * directly reported on the form. Falls back to the reported age when no
 * valid birthdate exists.
 */
export function resolveChildAgeMonths(
  reportedAgeMonths: number | null,
  birthdate: string | null,
  surveyDate: string,
): number | null {
  if (!birthdate) return reportedAgeMonths;

  const birth = new Date(birthdate);
  const survey = new Date(surveyDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(survey.getTime())) {
    return reportedAgeMonths;
  }

  const days = Math.round((survey.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return reportedAgeMonths;

  return Math.floor(days / 30.437);
}

/**
 * Exact age in days (birthdate to survey date), for the WHO z-score engine
 * specifically -- confirmed against a real ENA per-child dataset
 * (reference/ena_whz.csv) that ENA computes WHZ/HAZ/WAZ from a PRECISE
 * fractional-month age (e.g. "12.22", "48.92" months in its own output),
 * not a whole-month count. This app's z-score tables are keyed by exact
 * day (0-1856) already -- `resolveChildAgeMonths` above floors to a whole
 * month for inclusion/display/age-band purposes, and feeding THAT into the
 * z-score lookup meant converting days -> floored months -> days again, a
 * double-lossy round trip that measurably shifted HAZ (and to a lesser
 * extent WAZ) away from ENA's own numbers on this exact dataset. Returns
 * null when there's no valid birthdate, so callers fall back to the
 * whole-month conversion (the best available precision when only a
 * caretaker-reported age exists).
 */
export function resolveChildAgeDays(birthdate: string | null, surveyDate: string): number | null {
  if (!birthdate) return null;

  const birth = new Date(birthdate);
  const survey = new Date(surveyDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(survey.getTime())) return null;

  const days = Math.round((survey.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
}

/**
 * Port of the age-in-years recalculation in `process_mortality_members`
 * (the "current members" section, used for the sample-size-achieved
 * progress metric): when a valid birthdate was recorded, age in years is
 * `floor(days / 30.437 / 12)`, overriding the form's own reported
 * `age_years` field. Falls back to (a floored) reported age when no valid
 * birthdate exists -- the notebook floors `age_years` unconditionally at
 * the end regardless of which source it came from.
 */
export function resolveMemberAgeYears(
  reportedAgeYears: number | null,
  birthdate: string | null,
  surveyDate: string,
): number | null {
  if (birthdate) {
    const birth = new Date(birthdate);
    const survey = new Date(surveyDate);
    if (!Number.isNaN(birth.getTime()) && !Number.isNaN(survey.getTime())) {
      const days = Math.round((survey.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0) {
        return Math.floor(days / 30.437 / 12);
      }
    }
  }
  return reportedAgeYears !== null ? Math.floor(reportedAgeYears) : null;
}
