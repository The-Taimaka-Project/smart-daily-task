"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PullJob = {
  id: string;
  status: "pending" | "running" | "success" | "error";
  progress: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  householdCount: number | null;
  childCount: number | null;
  createdAt: string;
};

export function PullControls({ surveyConfigId }: { surveyConfigId: string }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<PullJob[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refreshJobs() {
    const res = await fetch(`/api/survey-configs/${surveyConfigId}/pull`);
    if (res.ok) setJobs(await res.json());
  }

  useEffect(() => {
    refreshJobs();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyConfigId]);

  const latest = jobs[0];
  const isActive = latest?.status === "pending" || latest?.status === "running";

  useEffect(() => {
    if (isActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        await refreshJobs();
      }, 3000);
    }
    if (!isActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  async function onPull() {
    setTriggering(true);
    setError(null);
    const res = await fetch(`/api/survey-configs/${surveyConfigId}/pull`, { method: "POST" });
    setTriggering(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to start pull.");
      return;
    }
    await refreshJobs();
  }

  return (
    <div className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">Pull latest data from ODK Central</h2>
          {latest && (
            <>
              <p className="text-sm text-neutral-500">
                Last pull: <StatusBadge status={latest.status} /> ·{" "}
                {isActive
                  ? (latest.progress ?? "starting...")
                  : latest.householdCount !== null
                    ? `${latest.householdCount} households, ${latest.childCount} children`
                    : (latest.errorMessage ?? "in progress")}
              </p>
              {latest.status === "success" && latest.errorMessage && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Some data didn&apos;t finish pulling: {latest.errorMessage}
                </p>
              )}
            </>
          )}
        </div>
        <button
          onClick={onPull}
          disabled={triggering || isActive}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {isActive ? "Pulling..." : "Pull latest"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: PullJob["status"] }) {
  const colors: Record<PullJob["status"], string> = {
    pending: "text-neutral-500",
    running: "text-blue-600",
    success: "text-green-600",
    error: "text-red-600",
  };
  return <span className={colors[status]}>{status}</span>;
}
