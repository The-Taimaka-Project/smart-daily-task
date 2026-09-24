/**
 * Statistical helpers for the ENA-equivalent plausibility report -- ported
 * from a reference implementation (Plausibility-and-Anthro-Webapp) the user
 * provided, adapted to this app's data shapes. Pure functions, no I/O.
 */
import * as ss from "simple-statistics";

/** Pearson chi-square test from observed/expected arrays. */
export function chiSquareTest(observed: number[], expected: number[]): { chi2: number; df: number; p: number } {
  if (observed.length !== expected.length) throw new Error("length mismatch");
  let chi2 = 0;
  let df = 0;
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i];
    if (e <= 0) continue;
    chi2 += (observed[i] - e) ** 2 / e;
    df++;
  }
  df = Math.max(1, df - 1);
  return { chi2, df, p: chiSquareSurvival(chi2, df) };
}

/** Survival function of chi-square (upper-tail p-value) via the regularized
 * upper incomplete gamma function. */
export function chiSquareSurvival(x: number, df: number): number {
  if (x <= 0) return 1;
  return regularizedGammaQ(df / 2, x / 2);
}

function logGamma(z: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  return 1 - regularizedGammaQ(a, x);
}

function regularizedGammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  if (x < a + 1) return 1 - regularizedGammaP(a, x);
  const eps = 1e-12;
  const fpmin = 1e-300;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = b + an / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/* ---------- Digit preference (SMART formula) ---------- */

/** Last-digit (0-9) counts. For MUAC (mm) or weight/height x10 (nearest 0.1). */
export function digitCounts(values: number[]): number[] {
  const c = new Array(10).fill(0);
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const d = Math.abs(Math.round(v)) % 10;
    c[d] += 1;
  }
  return c;
}

export function digitPercentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  return counts.map((c) => (c / total) * 100);
}

/**
 * SMART/ENA digit preference score: root-mean-square deviation from a
 * uniform 10% per digit: DPS = round(sqrt(sum((pct_i - 10)^2))).
 * Cutoffs: 0-7 excellent, 8-12 good, 13-20 acceptable, >20 problematic.
 */
export function digitPreferenceScore(values: number[]): number {
  const pcts = digitPercentages(digitCounts(values));
  const sumSq = pcts.reduce((s, p) => s + (p - 10) ** 2, 0);
  return Math.round(Math.sqrt(sumSq));
}

/* ---------- Histograms ---------- */

export function histogram(values: number[], min: number, max: number): Record<number, number> {
  const h: Record<number, number> = {};
  for (let i = min; i <= max; i++) h[i] = 0;
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const k = Math.floor(v);
    if (k >= min && k <= max) h[k] += 1;
  }
  return h;
}

/* ---------- Sex/age ratios ---------- */

export type SexAgeCell = {
  ageBand: string;
  months: number;
  obsBoys: number;
  obsGirls: number;
  expBoys: number;
  expGirls: number;
};

// ENA's overall sex/age table spans the full 0-59 month range in 5 bands
// (18+12+12+12+6 = 60 months) -- distinct from the SEPARATE "6-29 vs
// 30-59" age-RATIO indicator (pAgeRatio below), which deliberately starts
// at 6 months per SMART methodology (very young infants are typically
// under-enumerated, so that one ratio excludes them on purpose). Confused
// with each other before: AGE_BANDS started at "6 to 17", which silently
// excluded every under-6-month child from the overall sex ratio and age
// distribution chi-square tests too. Confirmed directly against a real ENA
// report on the exact same dataset: excluding 145 under-6-month children
// (65 boys, 80 girls) left 609 boys/570 girls instead of the correct
// 674/650, moving the sex-ratio p-value from ENA's 0.510 down to 0.256 for
// what should have been identical input data.
export const AGE_BANDS: { label: string; min: number; max: number; months: number }[] = [
  { label: "0 to 17", min: 0, max: 17, months: 18 },
  { label: "18 to 29", min: 18, max: 29, months: 12 },
  { label: "30 to 41", min: 30, max: 41, months: 12 },
  { label: "42 to 53", min: 42, max: 53, months: 12 },
  { label: "54 to 59", min: 54, max: 59, months: 6 },
];

/**
 * ENA sex/age contingency table. Age-ratio expectation (6-29 vs 30-59) uses
 * SMART's reference ratio of 0.85 (young:old), i.e. expYoung = N*(0.85/1.85).
 */
export function sexAgeTable(records: { sex: string | null; ageMonths: number | null }[]): {
  cells: SexAgeCell[];
  totals: { boys: number; girls: number; total: number };
  pSex: number;
  pAge: number;
  pAgeRatio: number;
} {
  const valid = records.filter((r) => r.ageMonths !== null && r.ageMonths >= 0 && r.ageMonths <= 59);
  const boys = valid.filter((r) => r.sex === "male").length;
  const girls = valid.filter((r) => r.sex === "female").length;
  const total = boys + girls;

  const totalMonths = AGE_BANDS.reduce((s, b) => s + b.months, 0); // 54
  const cells: SexAgeCell[] = AGE_BANDS.map((b) => {
    const fraction = b.months / totalMonths;
    const obsBoys = valid.filter((r) => r.sex === "male" && r.ageMonths! >= b.min && r.ageMonths! <= b.max).length;
    const obsGirls = valid.filter(
      (r) => r.sex === "female" && r.ageMonths! >= b.min && r.ageMonths! <= b.max,
    ).length;
    return { ageBand: b.label, months: b.months, obsBoys, obsGirls, expBoys: boys * fraction, expGirls: girls * fraction };
  });

  const pSex = chiSquareTest([boys, girls], [total / 2, total / 2]).p;

  const ageObs = cells.map((c) => c.obsBoys + c.obsGirls);
  const ageExp = cells.map((c) => c.expBoys + c.expGirls);
  const pAge = chiSquareTest(ageObs, ageExp).p;

  // This ratio's own population is 6-59 months only (SMART deliberately
  // excludes under-6-month infants here -- see the AGE_BANDS comment
  // above), which is narrower than `total` now that `valid` spans the
  // full 0-59 range for the sex ratio/age distribution tests. Expected
  // counts must be a fraction of THAT population, not of `total` -- using
  // `total` here previously (after widening `valid` to fix the sex-ratio
  // bug) mismatched observed vs expected by exactly the under-6-month
  // count and blew up this chi-square to a false "problematic" p=0.000.
  const young = valid.filter((r) => r.ageMonths! >= 6 && r.ageMonths! <= 29).length;
  const old = valid.filter((r) => r.ageMonths! >= 30 && r.ageMonths! <= 59).length;
  const ageRatioTotal = young + old;
  const expYoung = ageRatioTotal * (0.85 / 1.85);
  const expOld = ageRatioTotal * (1 / 1.85);
  const pAgeRatio = chiSquareTest([young, old], [expYoung, expOld]).p;

  return { cells, totals: { boys, girls, total }, pSex, pAge, pAgeRatio };
}

/* ---------- Misc ---------- */

export function safeStd(values: number[]): number | null {
  if (values.length < 2) return null;
  return ss.standardDeviation(values);
}
export function safeSkew(values: number[]): number | null {
  if (values.length < 3) return null;
  return ss.sampleSkewness(values);
}
export function safeKurt(values: number[]): number | null {
  if (values.length < 4) return null;
  return ss.sampleKurtosis(values);
}

/**
 * Index of Dispersion (ID) test for cluster-level aggregation of a binary
 * condition (e.g. WHZ < -2), matching ENA/SMART's "Poisson dist" row: are
 * cases spread evenly across clusters (as a homogeneous Poisson process
 * would predict), or are they "pocketed" in a few clusters?
 *
 * This is the classic/unweighted dispersion index: for clusters i=1..k with
 * x_i cases each, D = sum((x_i - mean(x))^2) / mean(x), tested against
 * chi-square with k-1 df. Each cluster's own size n_i is NOT used to scale
 * its expected count -- SMART survey design targets roughly equal sample
 * sizes per cluster, so ENA/EpiInfo's own test compares each cluster's raw
 * case count against the flat per-cluster average, not a size-weighted one.
 *
 * An earlier version weighted the expected count by cluster size
 * (e_i = n_i * overall_rate), which is the natural per-capita-rate
 * generalization but not what ENA actually computes: on a real dataset
 * (reference/ena_whz.csv's parent report) it gave ID=0.98 (wrong side of 1)
 * against ENA's own ID=1.04, while this unweighted version lands at ID=1.07
 * -- same side of 1, much closer p-value (0.31 vs ENA's 0.37 vs the
 * weighted version's 0.55).
 */
export function indexOfDispersion(clusters: { n: number; cases: number }[]): { id: number; p: number } | null {
  const valid = clusters.filter((c) => c.n > 0);
  if (valid.length < 2) return null;

  const totalCases = valid.reduce((s, c) => s + c.cases, 0);
  const meanCases = totalCases / valid.length;
  if (meanCases <= 0) return null;

  const observed = valid.map((c) => c.cases);
  const expected = valid.map(() => meanCases);
  const { chi2, df, p } = chiSquareTest(observed, expected);
  if (df <= 0) return null;

  return { id: chi2 / df, p };
}
