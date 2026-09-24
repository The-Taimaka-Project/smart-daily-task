import whoTablesJson from "./who_tables.json";

type Lms = { l: number; m: number; s: number };
type BySex = Record<"male" | "female", Record<string, Lms>>;
type WhoTables = {
  wfa: BySex;
  lfa: BySex;
  wfh: BySex;
  wfl: BySex;
};

const whoTables = whoTablesJson as unknown as WhoTables;

export type Sex = "male" | "female";

/**
 * Port of pygrowup's Observation class, restricted to the tables and age
 * range this app needs (children 0-59 months, so only the WHO "by_day"
 * reference tables apply -- pygrowup only switches to coarser "by_month"
 * tables past 1856 days / ~5 years, which we never reach).
 *
 * Reference: WHO Child Growth Standards, "Computation of centiles and
 * z-scores" (ch. 7). Formula and the |z|>3 weight-based re-centering are
 * taken directly from pygrowup/pygrowup.py.
 */

const WEIGHT_BASED = new Set(["wfa", "wfh", "wfl"]);

function round2(value: number): number {
  // Match Python's Decimal quantize(".01", ROUND_HALF_UP) rather than
  // banker's rounding, since ENA/SMART tooling assumes round-half-up.
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100)) / 100;
}

function ageInMonthsToDays(ageInMonths: number): number {
  // ROUND_HALF_UP, not floor: this only runs when there's no birthdate to
  // derive an exact day count from, so `ageInMonths` is a whole-number
  // reported age representing a full month's worth of possible ages, and
  // the midpoint is the better single-day estimate. This also matters at
  // exactly 24 months (730.5 days): WHO's length-for-age (<24mo, recumbent)
  // and height-for-age (>=24mo, standing) reference curves have a genuine
  // ~0.7cm discontinuity at the day-730/731 boundary, and a child reported
  // as a full 24 months old belongs on the >=24-month (day 731+) side of
  // it, not day 730 -- confirmed against reference/ena_whz.csv, where
  // flooring this same case put HAZ off by ~0.2 for exactly this group.
  const daysPerMonth = 365.25 / 12;
  return Math.round(ageInMonths * daysPerMonth);
}

function lookupLms(
  table: BySex,
  sex: Sex,
  key: string,
): Lms | undefined {
  return table[sex]?.[key];
}

function firstPassZScore(y: number, lms: Lms): number {
  const { l, m, s } = lms;
  const base = y / m;
  const power = Math.pow(base, l);
  const z = (power - 1) / (s * l);
  return round2(z);
}

function adjustWeightBasedZScore(
  zScore: number,
  y: number,
  lms: Lms,
): number {
  const { l, m, s } = lms;
  const exp = 1 / l;
  let z = zScore;
  if (zScore > 3) {
    const sd3PosBase = 1 + l * s * 3;
    const sd3Pos = m * Math.pow(sd3PosBase, exp);
    const sd23Pos1 = 1 + l * s * 3;
    const sd23Pos2 = 1 + l * s * 2;
    const sd23Pos = m * Math.pow(sd23Pos1, exp) - m * Math.pow(sd23Pos2, exp);
    z = 3 + (y - sd3Pos) / sd23Pos;
  } else if (zScore < -3) {
    const sd3NegBase = 1 + l * s * -3;
    const sd3Neg = m * Math.pow(sd3NegBase, exp);
    const sd23Neg1 = 1 + l * s * -2;
    const sd23Neg2 = 1 + l * s * -3;
    const sd23Neg = m * Math.pow(sd23Neg1, exp) - m * Math.pow(sd23Neg2, exp);
    z = -3 + (y - sd3Neg) / sd23Neg;
  }
  return round2(z);
}

function getZScore(
  tableName: "wfa" | "lfa" | "wfh" | "wfl",
  table: BySex,
  sex: Sex,
  y: number,
  key: string,
): number | null {
  const lms = lookupLms(table, sex, key);
  if (!lms) return null;
  let z = firstPassZScore(y, lms);
  if (WEIGHT_BASED.has(tableName) && Math.abs(z) > 3) {
    z = adjustWeightBasedZScore(z, y, lms);
  }
  return z;
}

/** Weight-for-age z-score. `ageInMonths` in months (0-59), `weightKg` in kg.
 * `ageInDays`, when provided, is used for the table lookup INSTEAD of
 * converting `ageInMonths` -- the reference table is keyed by exact day,
 * and a caller with a real birthdate can supply the true day count instead
 * of round-tripping through a floored whole-month age (which measurably
 * shifts the result -- see age.ts's `resolveChildAgeDays`). */
export function weightForAge(
  sex: Sex,
  ageInMonths: number,
  weightKg: number,
  ageInDays?: number,
): number | null {
  const t = ageInDays !== undefined ? ageInDays : ageInMonthsToDays(ageInMonths);
  if (t < 0 || t > 1856) return null;
  return getZScore("wfa", whoTables.wfa, sex, weightKg, String(t));
}

/**
 * Length/height-for-age z-score. Mirrors smart_functions.py's `get_anthro`,
 * which calls pygrowup's `length_or_height_for_age` without a recumbent flag
 * -- i.e. no +/-0.7cm standing/recumbent adjustment is applied here, matching
 * the existing production numbers this app must reproduce. `ageInDays`, when
 * provided, is used instead of converting `ageInMonths` -- see `weightForAge`.
 */
export function lengthOrHeightForAge(
  sex: Sex,
  ageInMonths: number,
  heightCm: number,
  ageInDays?: number,
): number | null {
  const t = ageInDays !== undefined ? ageInDays : ageInMonthsToDays(ageInMonths);
  if (t < 0 || t > 1856) return null;
  return getZScore("lfa", whoTables.lfa, sex, heightCm, String(t));
}

function quantizeTenth(value: number): string {
  // Table keys were exported via Python's `str(Decimal(...))`, which drops
  // the trailing ".0" for whole numbers (e.g. "65" not "65.0") but keeps one
  // decimal place otherwise (e.g. "65.1") -- match that exactly.
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Weight-for-height z-score (standing height, 65-120cm). */
export function weightForHeight(sex: Sex, weightKg: number, heightCm: number): number | null {
  if (heightCm < 65 || heightCm > 120) return null;
  const key = quantizeTenth(heightCm);
  return getZScore("wfh", whoTables.wfh, sex, weightKg, key);
}

/** Weight-for-length z-score (recumbent length, 45-110cm). */
export function weightForLength(sex: Sex, weightKg: number, lengthCm: number): number | null {
  if (lengthCm < 45 || lengthCm > 110) return null;
  const key = quantizeTenth(lengthCm);
  return getZScore("wfl", whoTables.wfl, sex, weightKg, key);
}

export type MalnStatus = "healthy" | "mam" | "sam" | "error" | "unknown";

export type AnthroResult = {
  whz: number | null;
  waz: number | null;
  haz: number | null;
  status: MalnStatus;
};

/**
 * Faithful port of `get_anthro` in smart_functions.py: computes WHZ/WAZ/HAZ
 * via the WHO LMS tables above (for display), but determines SAM/MAM/healthy
 * status via a direct lookup against the wfh.csv cutoff table (a
 * precomputed WHO weight-for-height cutoff, not derived from the WHZ
 * z-score) -- keep both computations, they are intentionally separate in the
 * existing workflow.
 */
export function getAnthro(
  sex: Sex,
  ageInMonths: number,
  weightKg: number,
  heightCm: number,
  hlYn: "h" | "l" | string,
  wfhCutoffLookup: (key: string) => { sdNeg3: number; sdNeg2: number } | undefined,
  ageInDays?: number,
): AnthroResult {
  if (
    ageInMonths === null ||
    ageInMonths === undefined ||
    Number.isNaN(ageInMonths) ||
    weightKg === null ||
    weightKg === undefined ||
    Number.isNaN(weightKg) ||
    heightCm === null ||
    heightCm === undefined ||
    Number.isNaN(heightCm)
  ) {
    return { whz: null, waz: null, haz: null, status: "unknown" };
  }

  const isRecumbent = String(hlYn).trim().toLowerCase() === "l";
  const whz = isRecumbent
    ? weightForLength(sex, weightKg, heightCm)
    : weightForHeight(sex, weightKg, heightCm);
  const waz = weightForAge(sex, ageInMonths, weightKg, ageInDays);
  const haz = lengthOrHeightForAge(sex, ageInMonths, heightCm, ageInDays);

  if (whz === null) {
    return { whz, waz, haz, status: "error" };
  }

  const gCode = sex === "male" ? "b" : "g";
  const mCode = isRecumbent ? "l" : "h";
  const heightStr = Number.isInteger(heightCm) ? String(heightCm) : heightCm.toFixed(1);
  const lookupKey = `${gCode}${mCode}-${heightStr}`;
  const cutoff = wfhCutoffLookup(lookupKey);

  let status: MalnStatus = "error";
  if (cutoff) {
    if (weightKg < cutoff.sdNeg3) status = "sam";
    else if (weightKg < cutoff.sdNeg2) status = "mam";
    else status = "healthy";
  }

  return { whz, waz, haz, status };
}
