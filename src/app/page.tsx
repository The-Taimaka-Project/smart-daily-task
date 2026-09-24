import Link from "next/link";
import { listSurveyConfigs } from "@/server/actions/survey-configs";

export default async function HomePage() {
  const configs = await listSurveyConfigs();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Surveys</h1>
        <Link
          href="/surveys/new"
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-neutral-900"
        >
          New survey config
        </Link>
      </div>

      {configs.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No survey configs yet. Create one to pull data for a round/survey area.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {configs.map((c) => (
            <li key={c.id}>
              <Link href={`/survey/${c.id}`} className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-neutral-500">
                  {c.dateFrom} → {c.dateTo} · project {c.odkProjectId} · form {c.mainFormId}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
