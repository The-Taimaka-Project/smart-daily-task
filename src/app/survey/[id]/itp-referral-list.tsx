"use client";

import { useState, useTransition } from "react";
import { setItpReferralReview } from "@/server/actions/itp-referral-reviews";
import type { ItpReferralRow } from "@/server/pipeline/itp-referral";

export type ItpReferralRowWithReview = ItpReferralRow & {
  enrolled: boolean | null;
  note: string | null;
  pid: string | null;
};

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
  const [isPending, startTransition] = useTransition();

  function updateLocal(key: string, patch: Partial<ItpReferralRowWithReview>) {
    setLocalRows((prev) =>
      prev.map((r) => (`${r.targetKind}:${r.targetOdkId}` === key ? { ...r, ...patch } : r)),
    );
  }

  function onEnrolledChange(row: ItpReferralRowWithReview, value: string) {
    const key = `${row.targetKind}:${row.targetOdkId}`;
    const enrolled = value === "yes" ? true : value === "no" ? false : null;
    updateLocal(key, { enrolled });
    startTransition(() => {
      setItpReferralReview(surveyConfigId, row.targetKind, row.targetOdkId, enrolled, row.note, row.pid);
    });
  }

  function onPidBlur(row: ItpReferralRowWithReview, pid: string) {
    startTransition(() => {
      setItpReferralReview(surveyConfigId, row.targetKind, row.targetOdkId, row.enrolled, row.note, pid || null);
    });
  }

  function onNoteBlur(row: ItpReferralRowWithReview, note: string) {
    startTransition(() => {
      setItpReferralReview(surveyConfigId, row.targetKind, row.targetOdkId, row.enrolled, note, row.pid);
    });
  }

  if (localRows.length === 0) {
    return <p className="text-sm text-neutral-500">No ITP referrals.</p>;
  }

  return (
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
                    disabled={isPending}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
