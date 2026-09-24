"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DateRangeForm({
  surveyConfigId,
  from,
  to,
}: {
  surveyConfigId: string;
  from: string;
  to: string;
}) {
  const router = useRouter();
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/survey/${surveyConfigId}/plausibility?from=${fromValue}&to=${toValue}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        From
        <input
          type="date"
          value={fromValue}
          onChange={(e) => setFromValue(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1">
        To
        <input
          type="date"
          value={toValue}
          onChange={(e) => setToValue(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>
      <button
        type="submit"
        className="rounded bg-neutral-900 px-3 py-2 text-white dark:bg-white dark:text-neutral-900"
      >
        Generate report
      </button>
    </form>
  );
}
