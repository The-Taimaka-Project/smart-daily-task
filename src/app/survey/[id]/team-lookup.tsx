"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeamLookup({
  surveyConfigId,
  date,
  team,
}: {
  surveyConfigId: string;
  date?: string;
  team?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(team ?? "");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (value.trim()) params.set("team", value.trim());
    router.push(`/survey/${surveyConfigId}/daily?${params.toString()}`, { scroll: false });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 text-sm">
      Team number
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700"
      >
        View
      </button>
    </form>
  );
}
