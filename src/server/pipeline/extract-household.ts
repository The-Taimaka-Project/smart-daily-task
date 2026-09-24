import { deepGet, toBoolLike, toNumberLike, toStringLike } from "@/server/odk/deep-get";
import { HOUSEHOLD_PATHS, SYSTEM_PATHS } from "./field-paths";
import type { HouseholdRecord } from "./types";

/** Builds one normalized HouseholdRecord from a raw root-Submission record. */
export function extractHousehold(raw: Record<string, unknown>, formId: string): HouseholdRecord {
  const odkId = toStringLike(deepGet(raw, SYSTEM_PATHS.odkId)) ?? "";
  const surveyDateRaw = toStringLike(deepGet(raw, HOUSEHOLD_PATHS.surveyDate));
  const teamNumber = toNumberLike(deepGet(raw, HOUSEHOLD_PATHS.teamNumber));
  const coordinates = deepGet(raw, HOUSEHOLD_PATHS.geopointCoordinates);
  const hasGeopoint = Array.isArray(coordinates) && coordinates.length >= 2;

  return {
    odkId,
    formId,
    surveyDate: normalizeDateOnly(surveyDateRaw) ?? "",
    deviceId: toStringLike(raw.deviceid),
    teamNumber: teamNumber !== null ? Math.trunc(teamNumber) : null,
    otpName: toStringLike(deepGet(raw, HOUSEHOLD_PATHS.otpName)),
    settlementName: toStringLike(deepGet(raw, HOUSEHOLD_PATHS.settlementName)),
    clusterNumber: null, // filled in by mergeClusterNumbers
    hhId: toNumberLike(deepGet(raw, HOUSEHOLD_PATHS.hhId)),
    startTime: toStringLike(raw.start),
    endTime: toStringLike(raw.end),
    hasGeopoint,
    consent: boolToYn(toBoolLike(deepGet(raw, HOUSEHOLD_PATHS.consentGiven))),
    absentHh: boolToYn(toBoolLike(deepGet(raw, HOUSEHOLD_PATHS.absentHh))),
    firstVisit: toStringLike(deepGet(raw, HOUSEHOLD_PATHS.firstVisit)),
    flags: [],
    raw,
  };
}

function boolToYn(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "true" : "false";
}

function normalizeDateOnly(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

/**
 * Drops "courtesy visit" households -- the notebook's
 * `df_id = df_id[df_id['hh_id']<=15]`, since real household ids only go up
 * to `expectedMax` and any higher value marks a non-sampled courtesy stop.
 */
export function excludeCourtesyHouseholds(
  households: HouseholdRecord[],
  expectedMax: number,
): HouseholdRecord[] {
  return households.filter((h) => h.hhId !== null && h.hhId <= expectedMax);
}

/** Filters raw records by the form's own `today` field, matching the
 * notebook's `df[(df['today']>=dateFrom)&(df['today']<=dateTo)]`. */
export function filterRawByTodayDateRange<T extends Record<string, unknown>>(
  raw: T[],
  dateFrom: string,
  dateTo: string,
): T[] {
  return raw.filter((r) => {
    const today = toStringLike(r.today);
    if (!today) return false;
    return today >= dateFrom && today <= dateTo;
  });
}
