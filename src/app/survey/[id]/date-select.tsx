"use client";

import { useRouter } from "next/navigation";

export function DateSelect({
  surveyConfigId,
  dates,
  selectedDate,
  team,
}: {
  surveyConfigId: string;
  dates: string[];
  selectedDate: string;
  team?: string;
}) {
  const router = useRouter();

  function onChange(date: string) {
    const params = new URLSearchParams();
    params.set("date", date);
    if (team) params.set("team", team);
    router.push(`/survey/${surveyConfigId}/daily?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      Date
      <select
        value={selectedDate}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
      >
        {dates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}
