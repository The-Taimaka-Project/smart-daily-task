import { notFound } from "next/navigation";
import { getSurveyConfig } from "@/server/actions/survey-configs";
import {
  loadChildren,
  loadHouseholds,
  loadHouseholdMembers,
  loadPregnancyBirths,
  listSurveyDatesDesc,
} from "@/server/queries/survey-data";
import {
  computeDeathsByTeam,
  computeHhTeamGrid,
  computeMissingClusterHouseholds,
  computePregnancyDeathFlags,
  computeSecondVisits,
  computeTeamDuration,
  computeTeamGeopointSummary,
  computeTimeDistribution,
  findHouseholdsByTeam,
  TIME_BUCKET_LABELS,
} from "@/server/pipeline/dashboard";
import { odkEditHref } from "@/server/odk/client";
import { DateSelect } from "../date-select";
import { TeamLookup } from "../team-lookup";
import { NavTabs } from "../nav-tabs";

const EXTREME_VALUE_FLAGS = new Set(["hl_ext", "muac_ext", "weight_ext"]);

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

type FlaggedChildRow = {
  targetOdkId: string;
  flagCode: string;
  surveyDate: string;
  teamNumber: number | null;
  hhId: number | null;
  ageMonths: number | null;
  weightKg: number | null;
  heightCm: number | null;
  muacMm: number | null;
};

export default async function DailySubmissionCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; team?: string }>;
}) {
  const { id } = await params;
  const { date, team } = await searchParams;

  const config = await getSurveyConfig(id);
  if (!config) notFound();

  const [households, children, pregnancyBirths, householdMembers] = await Promise.all([
    loadHouseholds(id),
    loadChildren(id),
    loadPregnancyBirths(id),
    loadHouseholdMembers(id),
  ]);

  const dates = listSurveyDatesDesc(households);
  const selectedDate = date ?? dates[0];
  const selectedTeam = team && team.trim() !== "" ? parseInt(team, 10) : null;

  const extremeValueFlags: FlaggedChildRow[] = [];
  const otherFlags: FlaggedChildRow[] = [];
  for (const c of children) {
    for (const flag of c.flags) {
      const row: FlaggedChildRow = {
        targetOdkId: c.odkChildKey,
        flagCode: flag,
        surveyDate: c.surveyDate,
        teamNumber: c.teamNumber,
        hhId: c.hhId,
        ageMonths: c.ageMonths,
        weightKg: c.weightKg,
        heightCm: c.heightCm,
        muacMm: c.muacMm,
      };
      if (EXTREME_VALUE_FLAGS.has(flag)) {
        // The form's own extreme-value flag is based on the RAW entry --
        // if our own sentinel-cleaning has since nulled out that exact
        // value (e.g. a raw 260mm MUAC placeholder), there's nothing real
        // left to show for this flag, so skip the row entirely.
        if (flag === "weight_ext" && c.weightKg === null) continue;
        if (flag === "hl_ext" && c.heightCm === null) continue;
        if (flag === "muac_ext" && c.muacMm === null) continue;
        extremeValueFlags.push(row);
      } else {
        otherFlags.push(row);
      }
    }
  }
  extremeValueFlags.sort((a, b) => (a.surveyDate < b.surveyDate ? -1 : a.surveyDate > b.surveyDate ? 1 : 0));

  const teamGeopoint = selectedDate ? computeTeamGeopointSummary(households, selectedDate) : [];
  const timeDistribution = selectedDate ? computeTimeDistribution(households, selectedDate) : [];
  const secondVisits = selectedDate ? computeSecondVisits(households, selectedDate) : [];
  // The revisit form re-submits the same hh_id/team pairing for a follow-up
  // visit -- including it here would falsely flag every revisited household
  // as a "count != 1" duplicate in what's meant to catch mis-keyed ids.
  const nonRevisitHouseholds = households.filter((h) => h.formId !== config.revisitFormId);
  const teamDuration = selectedDate ? computeTeamDuration(nonRevisitHouseholds, selectedDate) : [];
  const grid = selectedDate
    ? computeHhTeamGrid(nonRevisitHouseholds, selectedDate, config.expectedHhPerCluster)
    : null;
  const teamRows =
    selectedDate && selectedTeam !== null
      ? findHouseholdsByTeam(households, selectedDate, selectedTeam)
      : [];
  const missingCluster = selectedDate ? computeMissingClusterHouseholds(households, selectedDate) : [];
  // All dates, not just the selected one -- shown alongside Extreme values
  // and Flagged measurements below, which are both all-dates too.
  const pregnancyDeathFlags = computePregnancyDeathFlags(households, pregnancyBirths);
  const deathMembers = householdMembers.filter((m) => m.source === "death");
  const under5DeathsByTeam = computeDeathsByTeam(households, deathMembers, true);
  const totalDeathsByTeam = computeDeathsByTeam(households, deathMembers, false);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{config.name}</h1>
        <p className="text-sm text-neutral-500">Daily submission check</p>
      </div>

      <NavTabs surveyConfigId={id} active="daily" />

      {dates.length === 0 || !selectedDate ? (
        <p className="text-sm text-neutral-500">No submissions pulled yet.</p>
      ) : (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-lg font-semibold">Select a date</h2>
            <DateSelect surveyConfigId={id} dates={dates} selectedDate={selectedDate} team={team} />
          </div>

          <div className="mb-4 rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h3 className="mb-2 text-base font-semibold">
              Observations without a matching cluster number ({missingCluster.length})
            </h3>
            {missingCluster.length === 0 ? (
              <p className="text-neutral-500">Every submission on this date has a matching cluster number.</p>
            ) : (
              <>
                <p className="mb-2 text-neutral-500">
                  No row in the uploaded cluster-assignment sheet matched this submission&apos;s
                  (survey_date, team_number, settlement_name) -- check the settlement name for a typo on
                  either side.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {["team", "settlement", "hh_id", "start time", "ODK form"].map((h) => (
                          <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {missingCluster.map((h) => (
                        <tr key={h.odkId}>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{h.teamNumber}</td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{h.settlementName}</td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{h.hhId}</td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {h.startTime ? new Date(h.startTime).toLocaleString() : ""}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            <a
                              href={odkEditHref(id, h.formId, h.odkId)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline dark:text-blue-400"
                            >
                              Open in ODK Central
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <h3 className="mb-2 text-base font-semibold">Household ID × Team (should be exactly 1 each)</h3>
              {grid && grid.teamNumbers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                          hh \ team
                        </th>
                        {grid.teamNumbers.map((t) => (
                          <th key={t} className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.hhIds.map((hhId) => (
                        <tr key={hhId}>
                          <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">
                            {hhId}
                          </td>
                          {grid.teamNumbers.map((t) => {
                            const count = grid.countAt(hhId, t);
                            return (
                              <td
                                key={t}
                                className={`border border-neutral-200 px-2 py-1 text-center dark:border-neutral-800 ${
                                  count !== 1
                                    ? "font-bold text-red-600 dark:text-red-400"
                                    : "text-neutral-500"
                                }`}
                              >
                                {count}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-neutral-500">No submissions for this date.</p>
              )}
            </div>

            <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <h3 className="mb-2 text-base font-semibold">Second visits</h3>
              {secondVisits.length === 0 ? (
                <p className="text-neutral-500">None marked as a second visit for this date.</p>
              ) : (
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                        survey_date
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                        team_number
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                        hh_id
                      </th>
                      <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                        absent_hh
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {secondVisits.map((h) => (
                      <tr key={h.odkId}>
                        <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                          {h.surveyDate}
                        </td>
                        <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                          {h.teamNumber}
                        </td>
                        <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                          {h.hhId}
                        </td>
                        <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                          {h.absentHh}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-neutral-500">
                Cross-check this against the household IDs on the left showing 2 submissions -- if a
                duplicate isn&apos;t listed here as a genuine second visit, it&apos;s likely a mis-keyed
                household ID.
              </p>
            </div>
          </div>

          <div className="mb-4 rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h3 className="mb-3 text-base font-semibold">Look up a team&apos;s submissions</h3>
            <TeamLookup surveyConfigId={id} date={selectedDate} team={team} />
            {selectedTeam !== null && (
              <div className="mt-3">
                {teamRows.length === 0 ? (
                  <p className="text-neutral-500">No submissions for team {selectedTeam} on {selectedDate}.</p>
                ) : (
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          hh_id
                        </th>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          start time
                        </th>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          end time
                        </th>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          absent_hh
                        </th>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          form
                        </th>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          ODK form
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.map((r) => (
                        <tr key={r.odkId}>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {r.hhId}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {r.startTime ? new Date(r.startTime).toLocaleString() : ""}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {r.endTime ? new Date(r.endTime).toLocaleString() : ""}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {r.absentHh}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            {r.formId === config.mainFormId
                              ? "original"
                              : r.formId === config.revisitFormId
                                ? "revisit"
                                : r.formId}
                          </td>
                          <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                            <a
                              href={odkEditHref(id, r.formId, r.odkId)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 underline dark:text-blue-400"
                            >
                              Open in ODK Central
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <h3 className="mb-2 text-base font-semibold">Geopoint completeness</h3>
              <ul className="flex flex-col gap-1">
                {teamGeopoint.map((t) => (
                  <li key={t.teamNumber}>
                    Team {t.teamNumber}: {t.validGeopointCount}/{t.totalCount} ({t.validRatioPct}%)
                    {t.after13MissingCount > 0 && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {" "}
                        · {t.after13MissingCount} missing after 13:00
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
              <h3 className="mb-2 text-base font-semibold">Submission time distribution</h3>
              {timeDistribution.length === 0 ? (
                <p className="text-neutral-500">No submissions for this date.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                          team
                        </th>
                        {TIME_BUCKET_LABELS.map((label) => (
                          <th key={label} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeDistribution.map((t) => (
                        <tr key={t.teamNumber}>
                          <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">
                            {t.teamNumber}
                          </td>
                          {TIME_BUCKET_LABELS.map((label) => (
                            <td key={label} className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                              {t[label] ?? 0}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="mb-4 rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
            <h3 className="mb-2 text-base font-semibold">Submission duration</h3>
            <p className="mb-2 text-neutral-500">
              Time between a form&apos;s start and end, original form only (revisit visits aren&apos;t
              comparable to a first visit).
            </p>
            {teamDuration.length === 0 ? (
              <p className="text-neutral-500">No submissions with both a start and end time for this date.</p>
            ) : (
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {["team", "avg. duration", "whole duration", "n"].map((h) => (
                      <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamDuration.map((t) => (
                    <tr key={t.teamNumber}>
                      <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">
                        {t.teamNumber}
                      </td>
                      <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                        {formatMinutes(t.avgMinutes)}
                      </td>
                      <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                        {formatMinutes(t.wholeDurationMinutes)}
                      </td>
                      <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{t.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-lg font-semibold">Extreme values ({extremeValueFlags.length})</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Height/length, MUAC, or weight far enough outside the expected range for the child&apos;s age
          that the form flagged it as an extreme (not necessarily excluded from analysis).
        </p>
        <FlaggedTable rows={extremeValueFlags} />
      </section>

      <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-lg font-semibold">
          Pregnancy/death contradictions ({pregnancyDeathFlags.length})
        </h2>
        <p className="mb-3 text-sm text-neutral-500">
          Household reported no death, but also reported a pregnancy/birth whose outcome was
          &quot;died&quot; -- these two answers contradict each other within the same submission.
        </p>
        {pregnancyDeathFlags.length === 0 ? (
          <p className="text-sm text-neutral-500">None found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  {["survey_date", "team", "settlement", "hh_id", "outcome", "ODK form"].map((h) => (
                    <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pregnancyDeathFlags.map((f) => (
                  <tr key={f.householdOdkId}>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{f.surveyDate}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{f.teamNumber}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{f.settlementName}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{f.hhId}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{f.outcome}</td>
                    <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                      <a
                        href={odkEditHref(id, f.formId, f.householdOdkId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline dark:text-blue-400"
                      >
                        Open in ODK Central
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-lg font-semibold">Deaths recorded</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Every death entered in a household&apos;s death_list, counted by the team that submitted the
          household -- across all dates.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <DeathCountTable title="Under-5 deaths" rows={under5DeathsByTeam} />
          <DeathCountTable title="Total deaths (all ages)" rows={totalDeathsByTeam} />
        </div>
      </section>

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-lg font-semibold">Flagged measurements ({otherFlags.length})</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Everything besides the three Extreme-values codes above. Most of these are also warnings the
          form itself raised at data-entry time: <code>wfh_pos5_warn</code>/<code>wfh_neg5_warn</code>
          {" "}(weight-for-height looks implausibly high/low) and <code>oedema</code> (oedema checkbox --
          not an error by itself, just worth a second look). Three are computed by this app instead:{" "}
          <code>referral_number_mismatch</code> (child was marked referred, but the two referral-number
          fields on the form don&apos;t match each other), <code>muac_ge_20cm</code> (MUAC 20cm/200mm or
          more -- unusually large for a 0-59mo child, though still below the hard-implausible cutoff),
          and <code>implausible_measurement</code>{" "}
          (height/weight/MUAC still outside a hard plausible range after known sentinel values like
          150cm or 260mm are nulled out) -- this last one is the only flag here that also excludes the
          child from the plausibility report and z-score calculations, not just marks them for review.
        </p>
        <FlaggedTable rows={otherFlags} />
      </section>
    </div>
  );
}

function DeathCountTable({ title, rows }: { title: string; rows: { teamNumber: number; count: number }[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-neutral-500">None recorded.</p>
      ) : (
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">team</th>
              <th className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">deaths</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.teamNumber}>
                <td className="border border-neutral-200 px-2 py-1 font-medium dark:border-neutral-800">
                  {r.teamNumber}
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.count}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">Total</td>
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{total}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function FlaggedTable({ rows }: { rows: FlaggedChildRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Nothing flagged.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            {["flag", "survey_date", "team_number", "hh_id", "age", "weight", "height", "muac"].map((h) => (
              <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.targetOdkId}:${r.flagCode}:${i}`}>
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {r.flagCode}
                </span>
              </td>
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.surveyDate}</td>
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.teamNumber}</td>
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.hhId}</td>
              <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.ageMonths}</td>
              <td
                className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${
                  r.flagCode === "weight_ext" ? "font-bold text-red-600 dark:text-red-400" : ""
                }`}
              >
                {r.weightKg}
              </td>
              <td
                className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${
                  r.flagCode === "hl_ext" ? "font-bold text-red-600 dark:text-red-400" : ""
                }`}
              >
                {r.heightCm}
              </td>
              <td
                className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${
                  r.flagCode === "muac_ext" ? "font-bold text-red-600 dark:text-red-400" : ""
                }`}
              >
                {r.muacMm}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
