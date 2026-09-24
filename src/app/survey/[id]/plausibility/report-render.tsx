"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { PlausibilityReport } from "@/server/pipeline/plausibility-report";

const BAND_COLORS: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  good: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
  acceptable: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  problematic: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
};

const METRIC_SHORT_LABELS: Record<string, string> = {
  "Flagged data": "Flagged",
  "Sex ratio": "Sex ratio",
  "Age ratio (6-29 vs 30-59)": "Age ratio",
  "Dig pref score - weight": "Weight DPS",
  "Dig pref score - height": "Height DPS",
  "MUAC digit preference": "MUAC DPS",
  "Standard Dev WHZ": "WHZ SD",
};
function shortLabel(label: string): string {
  return METRIC_SHORT_LABELS[label] ?? label;
}

function fmtP(p: number) {
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}
function fmtNum(n: number, digits = 1) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function Badge({ band, children }: { band: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${BAND_COLORS[band] ?? ""}`}>
      {children}
    </span>
  );
}

const LEGEND_ITEMS: { band: string; label: string }[] = [
  { band: "excellent", label: "Excellent" },
  { band: "good", label: "Good" },
  { band: "acceptable", label: "Acceptable" },
  { band: "problematic", label: "Problematic" },
];

function Legend() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <span className="font-semibold">Score bands:</span>
      {LEGEND_ITEMS.map((item) => (
        <Badge key={item.band} band={item.band}>
          {item.label}
        </Badge>
      ))}
      <span className="text-xs text-neutral-500">
        Thresholds vary by criterion (p-value, % flagged, digit preference, SD, skew/kurtosis) -- see each row/chart
        for its own cutoffs.
      </span>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 text-sm text-neutral-500">{subtitle}</p>}
      {children}
    </section>
  );
}

export function ReportRender({ report }: { report: PlausibilityReport }) {
  return (
    <div>
      <Legend />

      <Section
        title="Overall data quality"
        subtitle={`Reference: ${report.meta.referenceStandard} · ${report.meta.totalRecords} records · ${report.meta.fromDate} to ${report.meta.toDate}`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Criterion", "Flags", "Unit", "Value", "Score"].map((h) => (
                  <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.overallScore.rows.map((r) => (
                <tr key={r.label}>
                  <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">{r.label}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.flag}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.unit}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.value}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    <Badge band={r.band}>{r.score}</Badge>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="border border-neutral-200 px-2 py-1 font-semibold dark:border-neutral-800" colSpan={4}>
                  OVERALL SCORE
                </td>
                <td className="border border-neutral-200 px-2 py-1 font-semibold dark:border-neutral-800">
                  <Badge band={report.overallScore.bandLabel}>{report.overallScore.totalScore}</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm">
          Survey overall score:
          <Badge band={report.overallScore.bandLabel}>
            <span className="capitalize">{report.overallScore.bandLabel}</span>
          </Badge>
        </p>
      </Section>

      <Section title="Missing data & birthdate">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Children with exact birthday" value={`${report.missing.pctWithBirthdate}%`} />
          <Stat label="Missing weight" value={report.missing.weight} />
          <Stat label="Missing height" value={report.missing.height} />
          <Stat label="Missing MUAC" value={report.missing.muac} />
        </div>
      </Section>

      <Section title="Age distribution (months)">
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.ageDistribution} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" interval={4} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#4C6EF5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section
        title="Sex x age (chi-square)"
        subtitle={`Overall sex ratio: p=${fmtP(report.sexAge.pSex)} · Age ratio (6-29 vs 30-59): p=${fmtP(report.sexAge.pAgeRatio)} · Overall age distribution: p=${fmtP(report.sexAge.pAge)}`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {["Age band", "Months", "Boys obs/exp (ratio)", "Girls obs/exp (ratio)", "Total obs/exp", "Ratio b/g"].map(
                  (h) => (
                    <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {report.sexAge.cells.map((c) => {
                const ratio = c.obsGirls ? c.obsBoys / c.obsGirls : Infinity;
                return (
                  <tr key={c.ageBand}>
                    <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">{c.ageBand}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{c.months}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                      {c.obsBoys}/{fmtNum(c.expBoys)} ({fmtNum(c.expBoys ? c.obsBoys / c.expBoys : 0, 2)})
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                      {c.obsGirls}/{fmtNum(c.expGirls)} ({fmtNum(c.expGirls ? c.obsGirls / c.expGirls : 0, 2)})
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                      {c.obsBoys + c.obsGirls}/{fmtNum(c.expBoys + c.expGirls)}
                    </td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                      {Number.isFinite(ratio) ? fmtNum(ratio, 2) : "--"}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">6 to 59</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">54</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{report.sexAge.totals.boys}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{report.sexAge.totals.girls}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{report.sexAge.totals.total}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800" />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Distribution of month of birth">
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.monthOfBirth} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" fill="#4C6EF5" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <DigitPrefSection
        title="weight (kg, last decimal)"
        data={report.digitPref.weight}
        byTeam={report.byTeam.map((t) => ({
          team: t.team,
          dps: t.weightDps,
          band: t.weightDpsBand,
          percents: t.weightDigitPercents,
        }))}
      />
      <DigitPrefSection
        title="height (cm, last decimal)"
        data={report.digitPref.height}
        byTeam={report.byTeam.map((t) => ({
          team: t.team,
          dps: t.heightDps,
          band: t.heightDpsBand,
          percents: t.heightDigitPercents,
        }))}
      />
      <DigitPrefSection
        title="MUAC (mm)"
        data={report.digitPref.muac}
        byTeam={report.byTeam.map((t) => ({
          team: t.team,
          dps: t.muacDps,
          band: t.muacDpsBand,
          percents: t.muacDigitPercents,
        }))}
      />

      <Section title="WHZ distribution" subtitle="After WHO fixed-range and SMART observed-mean +/-3SD flagging.">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="n (kept)" value={report.whz.n} />
          <Stat label="mean" value={report.whz.mean !== null ? report.whz.mean.toFixed(2) : "--"} />
          <Stat label="SD" value={report.whz.sd !== null ? report.whz.sd.toFixed(2) : "--"} />
          <Stat
            label="skew / kurtosis"
            value={`${report.whz.skewness !== null ? report.whz.skewness.toFixed(2) : "--"} / ${report.whz.kurtosis !== null ? report.whz.kurtosis.toFixed(2) : "--"}`}
          />
        </div>
      </Section>

      <Section title="Analysis by team">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {[
                  "Team",
                  "n",
                  "Sex ratio (m/f)",
                  "Age ratio (6-29/30-59)",
                  "Flagged %",
                  "SD (WHZ)",
                  "Weight DPS",
                  "Height DPS",
                  "MUAC DPS",
                ].map((h) => (
                  <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.byTeam.map((t) => (
                <tr key={t.team}>
                  <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">{t.team}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{t.n}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {Number.isFinite(t.sexRatio) ? fmtNum(t.sexRatio, 2) : "--"}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {Number.isFinite(t.ageRatio6_29_vs_30_59) ? fmtNum(t.ageRatio6_29_vs_30_59, 2) : "--"}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {t.flaggedPct !== null ? `${t.flaggedPct.toFixed(1)}%` : "--"}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {t.whzSd !== null ? t.whzSd.toFixed(2) : "--"}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{t.weightDps ?? "--"}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{t.heightDps ?? "--"}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{t.muacDps ?? "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <TeamSummarySection report={report} />
    </div>
  );
}

function DigitPrefSection({
  title,
  data,
  byTeam,
}: {
  title: string;
  data: { counts: number[]; percents: number[]; dps: number } | null;
  byTeam: { team: string; dps: number | null; band: string | null; percents: number[] | null }[];
}) {
  return (
    <Section
      title={`Digit preference -- ${title}`}
      subtitle={data ? `Overall DPS = ${data.dps}` : "No data for this measurement."}
    >
      {data && (
        <>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.percents.map((p, i) => ({ digit: `.${i}`, pct: Math.round(p * 10) / 10 }))}
                margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="digit" fontSize={11} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip />
                <Bar dataKey="pct" fill="#4C6EF5" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-semibold">Distribution by team (% ending in each digit)</h3>
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                    Ending digit
                  </th>
                  {byTeam.map((t) => (
                    <th key={t.team} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                      {t.team}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, digit) => (
                  <tr key={digit}>
                    <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">
                      {digit}
                    </td>
                    {byTeam.map((t) => (
                      <td key={t.team} className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                        {t.percents ? `${Math.round(t.percents[digit] * 10) / 10}%` : "--"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="border border-neutral-200 px-2 py-1 font-semibold dark:border-neutral-800">DPS</td>
                  {byTeam.map((t) => (
                    <td key={t.team} className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                      {t.band ? <Badge band={t.band}>{t.dps}</Badge> : "--"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

function TeamCard({ t, bgClass }: { t: PlausibilityReport["teamSummary"][number]; bgClass: string }) {
  return (
    <li className={`rounded border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800 ${bgClass}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{t.team}</span>
        <span className="text-xs text-neutral-500">
          n={t.n} · score {t.totalScore}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        {t.metrics.map((m) => (
          <span key={m.label} className={`rounded px-1.5 py-0.5 ${BAND_COLORS[m.band]}`}>
            {shortLabel(m.label)} {m.value}
          </span>
        ))}
      </div>
    </li>
  );
}

function TeamSummarySection({ report }: { report: PlausibilityReport }) {
  const doingWell = report.teamSummary.filter((t) => t.band === "excellent" || t.band === "good");
  const needsReview = report.teamSummary.filter((t) => t.band === "acceptable" || t.band === "problematic");

  return (
    <Section
      title="Team performance summary"
      subtitle="Each team scored against SMART thresholds on % flagged data, sex ratio, age ratio, weight/height/MUAC digit preference, and WHZ standard deviation."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Doing well ({doingWell.length})
          </h3>
          {doingWell.length === 0 ? (
            <p className="text-sm text-neutral-500">No teams in this group.</p>
          ) : (
            <ul className="space-y-2">
              {doingWell.map((t) => (
                <TeamCard key={t.team} t={t} bgClass="bg-emerald-50/50 dark:bg-emerald-950/20" />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
            Needs review ({needsReview.length})
          </h3>
          {needsReview.length === 0 ? (
            <p className="text-sm text-neutral-500">All teams within acceptable range.</p>
          ) : (
            <ul className="space-y-2">
              {needsReview.map((t) => (
                <TeamCard
                  key={t.team}
                  t={t}
                  bgClass={t.band === "problematic" ? "bg-rose-50/60 dark:bg-rose-950/20" : "bg-amber-50/60 dark:bg-amber-950/20"}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
