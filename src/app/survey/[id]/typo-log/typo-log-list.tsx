"use client";

import { useState } from "react";
import { setTypoLogReview, type TypoLogPatch } from "@/server/actions/typo-log-reviews";
import type { TypoLogRow } from "@/server/pipeline/typo-log";
import { CopyTableButton } from "../copy-table-button";

type SaveStatus = { state: "saving" | "saved" | "error"; message?: string };

export type TypoLogRowWithReview = TypoLogRow & {
  odkUrl: string;
  isTypo: boolean | null;
  correctBirthdate: string | null;
  correctAgeMonths: number | null;
  correctWeightKg: number | null;
  correctHeightCm: number | null;
  correctMuacMm: number | null;
  note: string | null;
  daniRevise: boolean | null;
};

function yesNoValue(v: boolean | null): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}
function parseYesNo(v: string): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Yellow highlight when a colleague's corrected value differs from the recorded one. */
function diffClass(recorded: number | string | null, corrected: number | string | null): string {
  if (corrected === null || corrected === "" || corrected === undefined) return "";
  if (recorded === null) return "bg-yellow-100 dark:bg-yellow-950";
  return String(recorded) !== String(corrected) ? "bg-yellow-100 dark:bg-yellow-950" : "";
}

const inputBase =
  "w-24 rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-transparent";

export function TypoLogList({
  surveyConfigId,
  rows,
}: {
  surveyConfigId: string;
  rows: TypoLogRowWithReview[];
}) {
  const [localRows, setLocalRows] = useState(rows);
  const [hideResolved, setHideResolved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const [lastPatch, setLastPatch] = useState<Record<string, TypoLogPatch>>({});

  // Awaited and error-caught on purpose: the previous version fired this as
  // an un-awaited, uncaught call, so a failed save (e.g. an auth problem)
  // looked identical to a successful one -- the edit disappeared on the
  // next reload with no indication anything went wrong. Now every save
  // attempt gets a visible Saving/Saved/Error status, and a failed one
  // offers Retry rather than silently vanishing.
  async function update(targetOdkId: string, patch: Partial<TypoLogRowWithReview>, dbPatch: TypoLogPatch) {
    setLocalRows((prev) => prev.map((r) => (r.targetOdkId === targetOdkId ? { ...r, ...patch } : r)));
    setLastPatch((prev) => ({ ...prev, [targetOdkId]: { ...prev[targetOdkId], ...dbPatch } }));
    setSaveStatus((prev) => ({ ...prev, [targetOdkId]: { state: "saving" } }));
    try {
      await setTypoLogReview(surveyConfigId, targetOdkId, dbPatch);
      setSaveStatus((prev) => ({ ...prev, [targetOdkId]: { state: "saved" } }));
      setTimeout(() => {
        setSaveStatus((prev) => {
          const { [targetOdkId]: _, ...rest } = prev;
          return rest;
        });
      }, 1500);
    } catch (err) {
      setSaveStatus((prev) => ({
        ...prev,
        [targetOdkId]: { state: "error", message: err instanceof Error ? err.message : "Save failed." },
      }));
    }
  }

  function retry(targetOdkId: string) {
    const patch = lastPatch[targetOdkId];
    if (patch) update(targetOdkId, {}, patch);
  }

  const visible = hideResolved ? localRows.filter((r) => r.daniRevise !== true) : localRows;

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">Nothing flagged.</p>;
  }

  const tableHeaders = [
    "status",
    "flag(s)",
    "survey_date",
    "team",
    "hh_id",
    "child_id",
    "child",
    "explanation",
    "birthdate",
    "age",
    "weight",
    "height",
    "muac",
    "typo?",
    "correct birthdate",
    "correct age",
    "correct weight",
    "correct height",
    "correct muac",
    "note",
    "dani-revise",
  ];
  const tableRows = visible.map((r) => [
    r.stillFlagged ? "Flagged" : "Resolved",
    r.flaggedIndices.map((f) => `${f.index} ${f.z.toFixed(2)}`).join("; "),
    r.surveyDate,
    r.teamNumber,
    r.hhId,
    r.childId,
    r.childName,
    r.explanation,
    r.birthdate,
    r.ageMonths,
    r.weightKg,
    r.heightCm,
    r.muacMm,
    yesNoValue(r.isTypo),
    r.correctBirthdate,
    r.correctAgeMonths,
    r.correctWeightKg,
    r.correctHeightCm,
    r.correctMuacMm,
    r.note,
    yesNoValue(r.daniRevise),
  ]);

  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm text-neutral-500">
        <input type="checkbox" checked={hideResolved} onChange={(e) => setHideResolved(e.target.checked)} />
        Hide rows Dani has already revised
      </label>
      <div className="mb-2 flex justify-end">
        <CopyTableButton headers={tableHeaders} rows={tableRows} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              {[
                "status",
                "flag(s)",
                "survey_date",
                "team",
                "hh_id",
                "child_id",
                "child",
                "explanation",
                "birthdate",
                "age",
                "weight",
                "height",
                "muac",
                "typo?",
                "correct birthdate",
                "correct age",
                "correct weight",
                "correct height",
                "correct muac",
                "note",
                "save status",
                "odk",
                "dani-revise",
              ].map((h) => (
                <th key={h} className="border border-neutral-200 px-2 py-1 text-left whitespace-nowrap dark:border-neutral-800">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.targetOdkId}>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  {r.stillFlagged ? (
                    <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Flagged
                    </span>
                  ) : (
                    <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      Resolved
                    </span>
                  )}
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  {r.flaggedIndices.map((f) => (
                    <span
                      key={f.index}
                      className="mr-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    >
                      {f.index} {f.z.toFixed(2)}
                    </span>
                  ))}
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.surveyDate}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.teamNumber}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.hhId}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.childId}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.childName}</td>
                <td className="min-w-64 border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.explanation}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.birthdate}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.ageMonths}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.weightKg}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.heightCm}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.muacMm}</td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  <select
                    value={yesNoValue(r.isTypo)}
                    onChange={(e) => {
                      const isTypo = parseYesNo(e.target.value);
                      update(r.targetOdkId, { isTypo }, { isTypo });
                    }}
                    className="rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">-</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </td>
                <td className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${diffClass(r.birthdate, r.correctBirthdate)}`}>
                  <input
                    type="date"
                    defaultValue={r.correctBirthdate ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value || null;
                      update(r.targetOdkId, { correctBirthdate: v }, { correctBirthdate: v });
                    }}
                    className={inputBase}
                  />
                </td>
                <td className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${diffClass(r.ageMonths, r.correctAgeMonths)}`}>
                  <input
                    type="number"
                    defaultValue={r.correctAgeMonths ?? ""}
                    onBlur={(e) => {
                      const v = numOrNull(e.target.value);
                      update(r.targetOdkId, { correctAgeMonths: v }, { correctAgeMonths: v });
                    }}
                    className={inputBase}
                  />
                </td>
                <td className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${diffClass(r.weightKg, r.correctWeightKg)}`}>
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={r.correctWeightKg ?? ""}
                    onBlur={(e) => {
                      const v = numOrNull(e.target.value);
                      update(r.targetOdkId, { correctWeightKg: v }, { correctWeightKg: v });
                    }}
                    className={inputBase}
                  />
                </td>
                <td className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${diffClass(r.heightCm, r.correctHeightCm)}`}>
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={r.correctHeightCm ?? ""}
                    onBlur={(e) => {
                      const v = numOrNull(e.target.value);
                      update(r.targetOdkId, { correctHeightCm: v }, { correctHeightCm: v });
                    }}
                    className={inputBase}
                  />
                </td>
                <td className={`border border-neutral-200 px-2 py-1 dark:border-neutral-800 ${diffClass(r.muacMm, r.correctMuacMm)}`}>
                  <input
                    type="number"
                    defaultValue={r.correctMuacMm ?? ""}
                    onBlur={(e) => {
                      const v = numOrNull(e.target.value);
                      update(r.targetOdkId, { correctMuacMm: v }, { correctMuacMm: v });
                    }}
                    className={inputBase}
                  />
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  <input
                    type="text"
                    defaultValue={r.note ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value || null;
                      update(r.targetOdkId, { note: v }, { note: v });
                    }}
                    className="w-36 rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-transparent"
                  />
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  {saveStatus[r.targetOdkId]?.state === "saving" && (
                    <span className="text-neutral-500">Saving...</span>
                  )}
                  {saveStatus[r.targetOdkId]?.state === "saved" && (
                    <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
                  )}
                  {saveStatus[r.targetOdkId]?.state === "error" && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-red-600 dark:text-red-400" title={saveStatus[r.targetOdkId]?.message}>
                        Not saved
                      </span>
                      <button
                        type="button"
                        onClick={() => retry(r.targetOdkId)}
                        className="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  <a
                    href={r.odkUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    Open in ODK
                  </a>
                </td>
                <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                  <select
                    value={yesNoValue(r.daniRevise)}
                    onChange={(e) => {
                      const daniRevise = parseYesNo(e.target.value);
                      update(r.targetOdkId, { daniRevise }, { daniRevise });
                    }}
                    className="rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">-</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
