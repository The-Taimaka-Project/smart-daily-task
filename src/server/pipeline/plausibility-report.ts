/**
 * ENA-equivalent plausibility report, built from this app's own cleaned
 * `ChildRecord`s (with WHZ/WAZ/HAZ already computed by the WHO z-score
 * engine in src/server/who-growth-standards). Scoring logic and thresholds
 * ported from a reference implementation the user provided
 * (Plausibility-and-Anthro-Webapp), adapted to use real weight/height/MUAC
 * digit-preference (that project defaulted to MUAC-only) and this app's
 * team/date fields.
 *
 * "Poisson dist WHZ-2" (a goodness-of-fit test for clustering of WHZ<-2
 * cases across survey clusters) IS scored -- see `indexOfDispersion` in
 * plausibility-stats.ts and `scorePoissonP` below.
 */
import type { ChildRecord } from "./types";
import {
  AGE_BANDS,
  digitCounts,
  digitPercentages,
  digitPreferenceScore,
  histogram,
  indexOfDispersion,
  safeKurt,
  safeSkew,
  safeStd,
  sexAgeTable,
} from "./plausibility-stats";
import { smartFlags, whoFlag } from "./plausibility-flags";

export type ScoreBand = "excellent" | "good" | "acceptable" | "problematic";

function scoreFlagged(pct: number): { score: number; band: ScoreBand } {
  if (pct <= 2.5) return { score: 0, band: "excellent" };
  if (pct <= 5) return { score: 5, band: "good" };
  if (pct <= 7.5) return { score: 10, band: "acceptable" };
  return { score: 20, band: "problematic" };
}
function scorePValue(p: number): { score: number; band: ScoreBand } {
  if (p > 0.1) return { score: 0, band: "excellent" };
  if (p > 0.05) return { score: 2, band: "good" };
  if (p > 0.001) return { score: 4, band: "acceptable" };
  return { score: 10, band: "problematic" };
}
function scoreDPS(dps: number): { score: number; band: ScoreBand } {
  if (dps <= 7) return { score: 0, band: "excellent" };
  if (dps <= 12) return { score: 2, band: "good" };
  if (dps <= 20) return { score: 4, band: "acceptable" };
  return { score: 10, band: "problematic" };
}
function scoreWhzSd(sd: number | null): { score: number; band: ScoreBand } {
  if (sd === null) return { score: 0, band: "excellent" };
  if (sd >= 0.9 && sd <= 1.1) return { score: 0, band: "excellent" };
  if (sd >= 0.85 && sd <= 1.15) return { score: 5, band: "good" };
  if (sd >= 0.8 && sd <= 1.2) return { score: 10, band: "acceptable" };
  return { score: 20, band: "problematic" };
}
function scoreSkewKurt(v: number | null): { score: number; band: ScoreBand } {
  if (v === null) return { score: 0, band: "excellent" };
  const a = Math.abs(v);
  if (a < 0.2) return { score: 0, band: "excellent" };
  if (a < 0.4) return { score: 1, band: "good" };
  if (a < 0.6) return { score: 3, band: "acceptable" };
  return { score: 5, band: "problematic" };
}
/** Same 0/1/3/5 scale as skew/kurtosis, but ENA's own p-value cutoffs for
 * this specific row (looser than the sex/age-ratio p-value scale). */
function scorePoissonP(p: number): { score: number; band: ScoreBand } {
  if (p > 0.05) return { score: 0, band: "excellent" };
  if (p > 0.01) return { score: 1, band: "good" };
  if (p > 0.001) return { score: 3, band: "acceptable" };
  return { score: 5, band: "problematic" };
}

type Row = { label: string; flag: string; unit: string; value: string; score: number; band: ScoreBand };

export type PlausibilityReport = {
  meta: {
    generatedAt: string;
    fromDate: string;
    toDate: string;
    totalRecords: number;
    referenceStandard: string;
  };
  overallScore: { rows: Row[]; totalScore: number; bandLabel: ScoreBand };
  missing: { weight: number; height: number; muac: number; pctWithBirthdate: number };
  ageDistribution: { month: number; count: number }[];
  monthOfBirth: { month: number; label: string; count: number }[];
  sexAge: ReturnType<typeof sexAgeTable>;
  digitPref: {
    weight: { counts: number[]; percents: number[]; dps: number } | null;
    height: { counts: number[]; percents: number[]; dps: number } | null;
    muac: { counts: number[]; percents: number[]; dps: number } | null;
  };
  whz: { n: number; mean: number | null; sd: number | null; skewness: number | null; kurtosis: number | null };
  byTeam: {
    team: string;
    n: number;
    sexRatio: number;
    ageRatio6_29_vs_30_59: number;
    pSex: number;
    pAgeRatio: number;
    muacDps: number | null;
    muacDpsBand: ScoreBand | null;
    muacDigitPercents: number[] | null;
    weightDps: number | null;
    weightDpsBand: ScoreBand | null;
    weightDigitPercents: number[] | null;
    heightDps: number | null;
    heightDpsBand: ScoreBand | null;
    heightDigitPercents: number[] | null;
    flaggedPct: number | null;
    whzSd: number | null;
  }[];
  teamSummary: TeamSummary[];
};

export type TeamSummary = {
  team: string;
  n: number;
  totalScore: number;
  band: ScoreBand;
  metrics: { label: string; value: string; score: number; band: ScoreBand }[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildPlausibilityReport(
  children: ChildRecord[],
  meta: { fromDate: string; toDate: string },
): PlausibilityReport {
  const records = children.filter((c) => !c.droppedAsImplausible);
  const total = records.length;

  const missingWeight = records.filter((r) => r.weightKg === null).length;
  const missingHeight = records.filter((r) => r.heightCm === null).length;
  const missingMuac = records.filter((r) => r.muacMm === null).length;
  const withBirthdate = records.filter((r) => r.birthdate).length;
  const pctWithBirthdate = total ? Math.round((withBirthdate / total) * 1000) / 10 : 0;

  const ageMonths = records.map((r) => r.ageMonths).filter((x): x is number => x !== null);
  const ageHist = histogram(ageMonths, 0, 59);
  const ageDistribution = Object.entries(ageHist).map(([m, c]) => ({ month: Number(m), count: c }));

  const mob = new Array(12).fill(0);
  for (const r of records) {
    if (!r.birthdate) continue;
    const m = Number(r.birthdate.slice(5, 7));
    if (m >= 1 && m <= 12) mob[m - 1]++;
  }
  const monthOfBirth = mob.map((c, i) => ({ month: i + 1, label: MONTH_LABELS[i], count: c }));

  const sa = sexAgeTable(records.map((r) => ({ sex: r.sex, ageMonths: r.ageMonths })));

  const muacVals = records.map((r) => r.muacMm).filter((x): x is number => x !== null);
  const weightDecimals = records
    .map((r) => r.weightKg)
    .filter((x): x is number => x !== null)
    .map((v) => Math.round(v * 10));
  const heightDecimals = records
    .map((r) => r.heightCm)
    .filter((x): x is number => x !== null)
    .map((v) => Math.round(v * 10));

  const hasMuac = muacVals.length > 0;
  const hasWeight = weightDecimals.length > 0;
  const hasHeight = heightDecimals.length > 0;

  const muacDPS = hasMuac ? digitPreferenceScore(muacVals) : null;
  const weightDPS = hasWeight ? digitPreferenceScore(weightDecimals) : null;
  const heightDPS = hasHeight ? digitPreferenceScore(heightDecimals) : null;

  // WHZ plausibility: WHO fixed-range flag first, then SMART's observed-mean
  // +/-3SD flag on what remains.
  const whzVals = records.map((r) => r.whz);
  const whzAfterWho = whzVals.map((z) => (z !== null && whoFlag(z, "WHZ") ? null : z));
  const whzSmartFlags = smartFlags(whzAfterWho);
  const whzKept = whzAfterWho
    .map((z, i) => (whzSmartFlags[i] || z === null ? null : z))
    .filter((z): z is number => z !== null);
  const whzN = whzKept.length;
  const whzSd = safeStd(whzKept);
  const whzSkew = safeSkew(whzKept);
  const whzKurt = safeKurt(whzKept);
  const whzValidCount = whzVals.filter((z) => z !== null).length;
  const whzFlaggedCount = whzValidCount - whzN;
  const whzFlaggedPct = whzValidCount ? (whzFlaggedCount / whzValidCount) * 100 : 0;
  const whzMean = whzKept.length ? whzKept.reduce((a, b) => a + b, 0) / whzKept.length : null;

  const hasWhz = whzVals.some((z) => z !== null);

  // Index of Dispersion for WHZ < -2 ("Poisson dist WHZ-2"): same
  // SMART-flag-excluded population as SD/skewness/kurtosis above, grouped
  // by cluster to test whether GAM-range cases are evenly spread or
  // "pocketed" in specific clusters.
  const clusterCaseCounts = new Map<string, { n: number; cases: number }>();
  for (let i = 0; i < records.length; i++) {
    const cluster = records[i].clusterNumber;
    if (cluster === null) continue;
    const z = whzAfterWho[i];
    if (whzSmartFlags[i] || z === null) continue;
    const entry = clusterCaseCounts.get(cluster) ?? { n: 0, cases: 0 };
    entry.n += 1;
    // Inclusive: a child at exactly WHZ=-2.00 counts as a case here.
    // Confirmed against a real ENA report on this exact dataset -- a
    // strict "<" put the Index of Dispersion on the wrong side of its
    // displayed value (0.98 vs ENA's 1.04); "<=" lands on ID=1.04 exactly.
    if (z <= -2) entry.cases += 1;
    clusterCaseCounts.set(cluster, entry);
  }
  const poissonWhz2 = indexOfDispersion([...clusterCaseCounts.values()]);

  const overallScoreRows: Row[] = [];
  if (hasWhz) {
    overallScoreRows.push({
      label: "Flagged data",
      flag: "Incl",
      unit: "%",
      value: `${whzFlaggedPct.toFixed(1)}%`,
      ...scoreFlagged(whzFlaggedPct),
    });
  }
  overallScoreRows.push({
    label: "Overall Sex ratio",
    flag: "Incl",
    unit: "p",
    value: `p=${sa.pSex.toFixed(3)}`,
    ...scorePValue(sa.pSex),
  });
  overallScoreRows.push({
    label: "Age ratio (6-29 vs 30-59)",
    flag: "Incl",
    unit: "p",
    value: `p=${sa.pAgeRatio.toFixed(3)}`,
    ...scorePValue(sa.pAgeRatio),
  });
  if (hasWeight) {
    overallScoreRows.push({
      label: "Dig pref score - weight",
      flag: "Incl",
      unit: "#",
      value: `${weightDPS}`,
      ...scoreDPS(weightDPS!),
    });
  }
  if (hasHeight) {
    overallScoreRows.push({
      label: "Dig pref score - height",
      flag: "Incl",
      unit: "#",
      value: `${heightDPS}`,
      ...scoreDPS(heightDPS!),
    });
  }
  if (hasMuac) {
    overallScoreRows.push({
      label: "Dig pref score - MUAC",
      flag: "Incl",
      unit: "#",
      value: `${muacDPS}`,
      ...scoreDPS(muacDPS!),
    });
  }
  if (hasWhz) {
    overallScoreRows.push({
      label: "Standard Dev WHZ",
      flag: "Excl",
      unit: "SD",
      value: whzSd !== null ? whzSd.toFixed(2) : "--",
      ...scoreWhzSd(whzSd),
    });
    overallScoreRows.push({
      label: "Skewness WHZ",
      flag: "Excl",
      unit: "#",
      value: whzSkew !== null ? whzSkew.toFixed(2) : "--",
      ...scoreSkewKurt(whzSkew),
    });
    overallScoreRows.push({
      label: "Kurtosis WHZ",
      flag: "Excl",
      unit: "#",
      value: whzKurt !== null ? whzKurt.toFixed(2) : "--",
      ...scoreSkewKurt(whzKurt),
    });
    overallScoreRows.push({
      label: "Poisson dist WHZ-2",
      flag: "Excl",
      unit: "p",
      value: poissonWhz2 ? `ID=${poissonWhz2.id.toFixed(2)} (p=${poissonWhz2.p.toFixed(3)})` : "not enough clusters",
      ...(poissonWhz2 ? scorePoissonP(poissonWhz2.p) : { score: 0, band: "excellent" as ScoreBand }),
    });
  }

  const totalScore = overallScoreRows.reduce((s, r) => s + r.score, 0);
  let bandLabel: ScoreBand = "excellent";
  if (totalScore > 24) bandLabel = "problematic";
  else if (totalScore > 14) bandLabel = "acceptable";
  else if (totalScore > 9) bandLabel = "good";

  const teams = Array.from(new Set(records.map((r) => r.teamNumber).filter((t): t is number => t !== null))).sort(
    (a, b) => a - b,
  );
  const byTeam = teams.map((team) => {
    const idxs = records.map((_, i) => i).filter((i) => records[i].teamNumber === team);
    const subset = idxs.map((i) => records[i]);
    const males = subset.filter((r) => r.sex === "male").length;
    const females = subset.filter((r) => r.sex === "female").length;
    const young = subset.filter((r) => r.ageMonths !== null && r.ageMonths >= 6 && r.ageMonths <= 29).length;
    const old = subset.filter((r) => r.ageMonths !== null && r.ageMonths >= 30 && r.ageMonths <= 59).length;
    const teamSA = sexAgeTable(subset.map((r) => ({ sex: r.sex, ageMonths: r.ageMonths })));
    const muacSubset = subset.map((r) => r.muacMm).filter((x): x is number => x !== null);
    const weightSubset = subset.map((r) => r.weightKg).filter((x): x is number => x !== null).map((v) => Math.round(v * 10));
    const heightSubset = subset.map((r) => r.heightCm).filter((x): x is number => x !== null).map((v) => Math.round(v * 10));

    // Same WHO-then-SMART flag population used for the overall "Flagged
    // data" / "Standard Dev WHZ" rows above, just filtered down to this
    // team's record indices -- reuses whzVals/whzAfterWho/whzSmartFlags
    // rather than re-flagging against a team-only mean, so a team's
    // "flagged %" reflects how much of ITS data is an outlier relative to
    // the whole survey, matching what the overall row already reports.
    const teamValidIdxs = idxs.filter((i) => whzVals[i] !== null);
    const teamKeptWhz = teamValidIdxs
      .filter((i) => !whzSmartFlags[i])
      .map((i) => whzAfterWho[i])
      .filter((z): z is number => z !== null);
    const flaggedPct = teamValidIdxs.length
      ? ((teamValidIdxs.length - teamKeptWhz.length) / teamValidIdxs.length) * 100
      : null;
    const whzSdTeam = teamKeptWhz.length ? safeStd(teamKeptWhz) : null;

    const muacDps = muacSubset.length ? digitPreferenceScore(muacSubset) : null;
    const weightDps = weightSubset.length ? digitPreferenceScore(weightSubset) : null;
    const heightDps = heightSubset.length ? digitPreferenceScore(heightSubset) : null;
    const muacDigitPercents = muacSubset.length ? digitPercentages(digitCounts(muacSubset)) : null;
    const weightDigitPercents = weightSubset.length ? digitPercentages(digitCounts(weightSubset)) : null;
    const heightDigitPercents = heightSubset.length ? digitPercentages(digitCounts(heightSubset)) : null;

    return {
      team: `Team ${team}`,
      n: subset.length,
      sexRatio: females ? males / females : Infinity,
      ageRatio6_29_vs_30_59: old ? young / old : Infinity,
      pSex: teamSA.pSex,
      pAgeRatio: teamSA.pAgeRatio,
      muacDps,
      muacDigitPercents,
      weightDigitPercents,
      heightDigitPercents,
      muacDpsBand: muacDps !== null ? scoreDPS(muacDps).band : null,
      weightDps,
      weightDpsBand: weightDps !== null ? scoreDPS(weightDps).band : null,
      heightDps,
      heightDpsBand: heightDps !== null ? scoreDPS(heightDps).band : null,
      flaggedPct,
      whzSd: whzSdTeam,
    };
  });

  const teamSummary: TeamSummary[] = byTeam.map((t) => {
    const muacScore = t.muacDps !== null ? scoreDPS(t.muacDps) : null;
    const weightScore = t.weightDps !== null ? scoreDPS(t.weightDps) : null;
    const heightScore = t.heightDps !== null ? scoreDPS(t.heightDps) : null;
    const sexScore = scorePValue(t.pSex);
    const ageScore = scorePValue(t.pAgeRatio);
    const flaggedScore = t.flaggedPct !== null ? scoreFlagged(t.flaggedPct) : null;
    const sdScore = t.whzSd !== null ? scoreWhzSd(t.whzSd) : null;
    const metrics = [
      ...(flaggedScore ? [{ label: "Flagged data", value: `${t.flaggedPct!.toFixed(1)}%`, ...flaggedScore }] : []),
      { label: "Sex ratio", value: `p=${t.pSex.toFixed(3)}`, ...sexScore },
      { label: "Age ratio (6-29 vs 30-59)", value: `p=${t.pAgeRatio.toFixed(3)}`, ...ageScore },
      ...(weightScore ? [{ label: "Dig pref score - weight", value: String(t.weightDps), ...weightScore }] : []),
      ...(heightScore ? [{ label: "Dig pref score - height", value: String(t.heightDps), ...heightScore }] : []),
      ...(muacScore ? [{ label: "MUAC digit preference", value: String(t.muacDps), ...muacScore }] : []),
      ...(sdScore ? [{ label: "Standard Dev WHZ", value: t.whzSd!.toFixed(2), ...sdScore }] : []),
    ];
    const teamTotal = metrics.reduce((s, m) => s + m.score, 0);
    let band: ScoreBand = "excellent";
    if (metrics.some((m) => m.band === "problematic")) band = "problematic";
    else if (metrics.some((m) => m.band === "acceptable")) band = "acceptable";
    else if (metrics.some((m) => m.band === "good")) band = "good";
    return { team: t.team, n: t.n, totalScore: teamTotal, band, metrics };
  });
  teamSummary.sort((a, b) => a.totalScore - b.totalScore || a.team.localeCompare(b.team));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      fromDate: meta.fromDate,
      toDate: meta.toDate,
      totalRecords: total,
      referenceStandard: "WHO standards 2006",
    },
    overallScore: { rows: overallScoreRows, totalScore, bandLabel },
    missing: { weight: missingWeight, height: missingHeight, muac: missingMuac, pctWithBirthdate },
    ageDistribution,
    monthOfBirth,
    sexAge: sa,
    digitPref: {
      weight: hasWeight
        ? { counts: digitCounts(weightDecimals), percents: digitPercentages(digitCounts(weightDecimals)), dps: weightDPS! }
        : null,
      height: hasHeight
        ? { counts: digitCounts(heightDecimals), percents: digitPercentages(digitCounts(heightDecimals)), dps: heightDPS! }
        : null,
      muac: hasMuac
        ? { counts: digitCounts(muacVals), percents: digitPercentages(digitCounts(muacVals)), dps: muacDPS! }
        : null,
    },
    whz: { n: whzN, mean: whzMean, sd: whzSd, skewness: whzSkew, kurtosis: whzKurt },
    byTeam,
    teamSummary,
  };
}

export { AGE_BANDS };
