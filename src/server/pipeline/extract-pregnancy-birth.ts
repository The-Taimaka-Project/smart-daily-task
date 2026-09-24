import { deepGet, toNumberLike, toStringLike } from "@/server/odk/deep-get";
import { SYSTEM_PATHS } from "./field-paths";

/**
 * One row of the main form's "not_absent_hh.smart_survey.preg_birth_list"
 * repeat group -- a pregnancy or birth event reported for a household,
 * confirmed against a real export (CSV columns: position_preg_birth,
 * preg_birth_outcome, preg_birth_death, PARENT_KEY, KEY).
 */
export type PregnancyBirthRecord = {
  odkKey: string;
  householdOdkId: string;
  position: number | null;
  outcome: string | null;
  raw: Record<string, unknown>;
};

export function extractPregnancyBirth(raw: Record<string, unknown>): PregnancyBirthRecord {
  return {
    odkKey: toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "",
    householdOdkId: toStringLike(deepGet(raw, SYSTEM_PATHS.parentSubmissionId)) ?? "",
    position: toNumberLike(raw.position_preg_birth),
    outcome: toStringLike(raw.preg_birth_outcome),
    raw,
  };
}
