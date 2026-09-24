/**
 * Applies manual field-level corrections on top of the pulled/cleaned
 * data -- the web-app equivalent of a manual pandas exception like:
 *   df_id.loc[df_id['__id'] == 'uuid:...', 'team_number'] = '6'
 * Applied at read time (not baked into a pull), so every screen (daily
 * submission check, referral, typo log, plausibility check) sees the same
 * corrected values, and a correction takes effect immediately without
 * needing to re-pull.
 */
import type { ChildRecord, HouseholdRecord } from "./types";
import { getAnthro } from "@/server/who-growth-standards/zscore";
import { lookupWfhCutoff } from "@/server/who-growth-standards/wfh-cutoffs";

export const HOUSEHOLD_CORRECTION_FIELDS = ["team_number", "otp_name", "settlement_name", "hh_id"] as const;
export const CHILD_CORRECTION_FIELDS = [
  "sex",
  "birthdate",
  "age_months",
  "weight_kg",
  "height_cm",
  "muac_mm",
] as const;

export type CorrectionField =
  | (typeof HOUSEHOLD_CORRECTION_FIELDS)[number]
  | (typeof CHILD_CORRECTION_FIELDS)[number];

export const CORRECTION_FIELD_LABELS: Record<CorrectionField, string> = {
  team_number: "Team number (household)",
  otp_name: "OTP / site (household)",
  settlement_name: "Settlement name (household)",
  hh_id: "Household ID (hh_id)",
  sex: "Sex (child)",
  birthdate: "Birthdate (child)",
  age_months: "Age in months (child)",
  weight_kg: "Weight, kg (child)",
  height_cm: "Height/length, cm (child)",
  muac_mm: "MUAC, mm (child)",
};

export type ManualCorrection = {
  id: string;
  targetOdkId: string;
  fieldName: string;
  correctedValue: string;
};

function byTarget(corrections: ManualCorrection[]): Map<string, ManualCorrection[]> {
  const map = new Map<string, ManualCorrection[]>();
  for (const c of corrections) {
    const list = map.get(c.targetOdkId) ?? [];
    list.push(c);
    map.set(c.targetOdkId, list);
  }
  return map;
}

/** Household-level corrections: team_number, otp_name, settlement_name, hh_id.
 * Cluster number is deliberately NOT set here -- re-run mergeClusterNumbers
 * afterward so a team/settlement correction produces a consistent cluster. */
export function applyHouseholdCorrections(
  households: HouseholdRecord[],
  corrections: ManualCorrection[],
): HouseholdRecord[] {
  const grouped = byTarget(corrections);
  return households.map((h) => {
    const own = grouped.get(h.odkId);
    if (!own || own.length === 0) return h;

    const patch: Partial<HouseholdRecord> = {};
    for (const c of own) {
      if (c.fieldName === "team_number") {
        const n = parseInt(c.correctedValue, 10);
        if (!Number.isNaN(n)) patch.teamNumber = n;
      } else if (c.fieldName === "otp_name") {
        patch.otpName = c.correctedValue;
      } else if (c.fieldName === "settlement_name") {
        patch.settlementName = c.correctedValue;
      } else if (c.fieldName === "hh_id") {
        const n = parseInt(c.correctedValue, 10);
        if (!Number.isNaN(n)) patch.hhId = n;
      }
    }
    return { ...h, ...patch };
  });
}

/** Child-level corrections: sex, birthdate, age, weight, height, MUAC.
 * When any anthropometric input changes, WHZ/WAZ/HAZ and malnStatus are
 * recomputed so the plausibility report and typo log reflect the fix. */
export function applyChildCorrections(children: ChildRecord[], corrections: ManualCorrection[]): ChildRecord[] {
  const grouped = byTarget(corrections);
  return children.map((c) => {
    const own = grouped.get(c.odkChildKey);
    if (!own || own.length === 0) return c;

    const patch: Partial<ChildRecord> = {};
    let anthroChanged = false;
    for (const corr of own) {
      switch (corr.fieldName) {
        case "sex":
          if (corr.correctedValue === "male" || corr.correctedValue === "female") {
            patch.sex = corr.correctedValue;
            anthroChanged = true;
          }
          break;
        case "birthdate":
          patch.birthdate = corr.correctedValue;
          break;
        case "age_months": {
          const n = Number(corr.correctedValue);
          if (Number.isFinite(n)) {
            patch.ageMonths = n;
            anthroChanged = true;
          }
          break;
        }
        case "weight_kg": {
          const n = Number(corr.correctedValue);
          if (Number.isFinite(n)) {
            patch.weightKg = n;
            anthroChanged = true;
          }
          break;
        }
        case "height_cm": {
          const n = Number(corr.correctedValue);
          if (Number.isFinite(n)) {
            patch.heightCm = n;
            anthroChanged = true;
          }
          break;
        }
        case "muac_mm": {
          const n = Number(corr.correctedValue);
          if (Number.isFinite(n)) patch.muacMm = n;
          break;
        }
        default:
          break;
      }
    }

    const next = { ...c, ...patch };

    if (anthroChanged && next.sex && next.ageMonths !== null && next.weightKg !== null && next.heightCm !== null) {
      const anthro = getAnthro(next.sex, next.ageMonths, next.weightKg, next.heightCm, next.hlYn ?? "h", lookupWfhCutoff);
      next.whz = anthro.whz;
      next.waz = anthro.waz;
      next.haz = anthro.haz;
      next.malnStatus = anthro.status;
    }

    return next;
  });
}
