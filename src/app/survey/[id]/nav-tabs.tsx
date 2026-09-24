import Link from "next/link";

export function NavTabs({
  surveyConfigId,
  active,
}: {
  surveyConfigId: string;
  active: "overview" | "daily" | "referral" | "typo-log" | "plausibility";
}) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/survey/${surveyConfigId}` },
    { key: "daily", label: "Daily submission check", href: `/survey/${surveyConfigId}/daily` },
    { key: "referral", label: "Referral", href: `/survey/${surveyConfigId}/referral` },
    { key: "typo-log", label: "Log of typo", href: `/survey/${surveyConfigId}/typo-log` },
    { key: "plausibility", label: "Plausibility check", href: `/survey/${surveyConfigId}/plausibility` },
  ] as const;

  return (
    <div className="mb-6 flex items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`shrink-0 px-3 py-2 text-sm ${
              t.key === active
                ? "border-b-2 border-neutral-900 font-medium dark:border-white"
                : "text-neutral-500"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Link
        href={`/survey/${surveyConfigId}/edit`}
        className="shrink-0 px-3 py-2 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
      >
        Edit settings
      </Link>
    </div>
  );
}
