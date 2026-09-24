import { deepGet, toNumberLike, toStringLike } from "@/server/odk/deep-get";
import { OUTSIDE_PATHS, SYSTEM_PATHS } from "./field-paths";

export type OutsideChildRecord = {
  odkId: string;
  formId: string;
  surveyDate: string | null;
  teamNumber: number | null;
  otpName: string | null;
  settlementName: string | null;
  raw: Record<string, unknown>;
};

/** Builds one record from the separate "outside sample" form (see
 * OUTSIDE_PATHS -- field paths here are a best-effort inference, not yet
 * confirmed against a live submission). */
export function extractOutsideChild(raw: Record<string, unknown>, formId: string): OutsideChildRecord {
  const teamNumber = toNumberLike(deepGet(raw, OUTSIDE_PATHS.teamNumber));
  return {
    odkId: toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "",
    formId,
    surveyDate: toStringLike(deepGet(raw, OUTSIDE_PATHS.surveyDate))?.slice(0, 10) ?? null,
    teamNumber: teamNumber !== null ? Math.trunc(teamNumber) : null,
    otpName: toStringLike(deepGet(raw, OUTSIDE_PATHS.otpName)),
    settlementName: toStringLike(deepGet(raw, OUTSIDE_PATHS.settlementName)),
    raw,
  };
}
