"use client";

import { useState } from "react";
import { setItpReferralReview } from "@/server/actions/itp-referral-reviews";
import type { ItpReferralRow } from "@/server/pipeline/itp-referral";
import { CopyTableButton } from "./copy-table-button";

export type ItpReferralRowWithReview = ItpReferralRow & {
  enrolled: boolean | null;
  note: string | null;
  pid: string | null;
};

type SaveStatus = { state: "saving" | "saved" | "error"; message?: string };

function enrolledToSelectValue(enrolled: boolean | null): string {
  if (enrolled === true) return "yes";
  if (enrolled === false) return "no";
  return "";
}

export function ItpReferralList({
  surveyConfigId,
  rows,
}: {
  surveyConfigId: string;
  rows: ItpReferralRowWithReview[];
}) {
  const [localRows, setLocalRows] = useState(rows);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});

  function updateLocal(key: string, patch: Partial<ItpReferralRowWithReview>) {
    setLocalRows((prev) =>
      prev.map((r) => (`${r.targetKind}:${r.targetOdkId}` === key ? { ...r, ...patch } : r)),
    );
  }

  // Awaited and error-caught on purpose: the previous version fired this as
  // an un-awaited, uncaught call, so a failed save (e.g. an auth problem)
  // looked identical to a successful one -- the edit disappeared on the
  // next reload with no indication anything went wrong. Now every save
  // attempt gets a visible Saving/Saved/Error status, and a failed one
  // offers Retry rather than silently vanishing.
  async function saveRow(
    row: ItpReferralRowWithReview,
    patch: { enrolled?: boolean | null; note?: string | null; pid?: string | null },
  ) {
    const key = `${row.targetKind}:${row.targetOdkId}`;
    const merged = {
      enrolled: patch.enrolled !== undefined ? patch.enrolled : row.enrolled,
      note: patch.note !== undefined ? patch.note : row.note,
      pid: patch.pid !== undefined ? patch.pid : row.pid,
    };
    setSaveStatus((prev) => ({ ...prev, [key]: { state: "saving" } }));
    try {
      await setItpReferralReview(surveyConfigId, row.targetKind, row.targetOdkId, merged.enrolled, merged.note, merged.pid);
      setSaveStatus((prev) => ({ ...prev, [key]: { state: "saved" } }));
      setTimeout(() => {
        setSaveStatus((prev) => {
          const { [key]: _, ...rest } = prev;
          return rest;
        });
      }, 1500);
    } catch (err) {
      setSaveStatus((prev) => ({
        ...prev,
        [key]: { state: "error", message: err instanceof Error ? err.message : "Save failed." },
      }));
    }
  }

  function onEnrolledChange(row: ItpReferralRowWithReview, value: string) {
    const key = `${row.targetKind}:${row.targetOdkId}`;
    const enrolled = value === "yes" ? true : value === "no" ? false : null;
    updateLocal(key, { enrolled });
    saveRow(row, { enrolled });
  }

  function onPidBlur(row: ItpReferralRowWithReview, pid: string) {
    const value = pid || null;
    updateLocal(`${row.targetKind}:${row.targetOdkId}`, { pid: value });
    saveRow(row, { pid: value });
  }

  function onNoteBlur(row: ItpReferralRowWithReview, note: string) {
    const value = note || null;
    updateLocal(`${row.targetKind}:${row.targetOdkId}`, { note: value });
    saveRow(row, { note: value });
  }

  if (localRows.length === 0) {
    return <p className="text-sm text-neutral-500">No ITP referrals.</p>;
  }

  const tableHeaders = [
    "survey_date",
    "team",
    "otp",
    "settlement",
    "child",
    "age",
    "imci emergency",
    "muac",
    "weight",
    "height",
    "referral_itp",
    "enrolled?",
    "pid",
    "note",
  ];
  const tableRows = localRows.map((r) => [
    r.surveyDate,
    r.teamNumber,
    r.otpName,
    r.settlement,
    r.childName,
    r.ageMonths,
    `${r.imciEmergencyList ?? ""}${r.imciEmergencyListOther ? ` (${r.imciEmergencyListOther})` : ""}`,
    r.muac,
    r.weight,
    r.finalHl,
    r.referralItp,
    r.enrolled === true ? "Yes" : r.enrolled === false ? "No" : "",
    r.pid,
    r.note,
  ]);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <CopyTableButton headers={tableHeaders} rows={tableRows} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              {[
                "survey_date",
                "team",
                "otp",
                "settlement",
                "child",
                "age",
                "imci emergency",
                "muac",
                "weight",
                "height",
                "referral_itp",
                "enrolled?",
                "pid",
                "note",
                "save status",
              ].map((h) => (
                <th key={h} className="border border-neutral-200 px-2 py-1 text-left dark:border-neutral-800">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {localRows.map((r) => {
              const key = `${r.targetKind}:${r.targetOdkId}`;
              const status = saveStatus[key];
              return (
                <tr key={key}>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.surveyDate}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.teamNumber}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.otpName}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.settlement}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.childName}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.ageMonths}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {r.imciEmergencyList}
                    {r.imciEmergencyListOther ? ` (${r.imciEmergencyListOther})` : ""}
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.muac}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.weight}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.finalHl}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">{r.referralItp}</td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    <select
                      value={enrolledToSelectValue(r.enrolled)}
                      onChange={(e) => onEnrolledChange(r, e.target.value)}
                      className="rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="">-</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    <input
                      type="text"
                      defaultValue={r.pid ?? ""}
                      onBlur={(e) => onPidBlur(r, e.target.value)}
                      className="w-24 rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    <input
                      type="text"
                      defaultValue={r.note ?? ""}
                      onBlur={(e) => onNoteBlur(r, e.target.value)}
                      className="w-32 rounded border border-neutral-300 px-1 py-0.5 dark:border-neutral-700 dark:bg-neutral-900"
                    />
                  </td>
                  <td className="border border-neutral-200 px-2 py-1 dark:border-neutral-800">
                    {status?.state === "saving" && <span className="text-neutral-500">Saving...</span>}
                    {status?.state === "saved" && <span className="text-emerald-600 dark:text-emerald-400">Saved</span>}
                    {status?.state === "error" && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-red-600 dark:text-red-400" title={status.message}>
                          Not saved
                        </span>
                        <button
                          type="button"
                          onClick={() => saveRow(r, {})}
                          className="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700"
                        >
                          Retry
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
