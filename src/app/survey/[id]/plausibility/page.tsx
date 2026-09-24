import { notFound } from "next/navigation";
import { getSurveyConfig } from "@/server/actions/survey-configs";
import { loadChildren } from "@/server/queries/survey-data";
import { buildPlausibilityReport } from "@/server/pipeline/plausibility-report";
import { NavTabs } from "../nav-tabs";
import { DateRangeForm } from "./date-range-form";
import { ReportRender } from "./report-render";

export default async function PlausibilityCheckPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const { from, to } = await searchParams;

  const config = await getSurveyConfig(id);
  if (!config) notFound();

  const rangeFrom = from ?? config.dateFrom;
  const rangeTo = to ?? config.dateTo;

  const allChildren = await loadChildren(id);
  const children = allChildren.filter((c) => c.surveyDate >= rangeFrom && c.surveyDate <= rangeTo);

  const report = buildPlausibilityReport(children, { fromDate: rangeFrom, toDate: rangeTo });

  const exportUrl = `/api/survey-configs/${id}/export?from=${rangeFrom}&to=${rangeTo}`;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{config.name}</h1>
        <p className="text-sm text-neutral-500">Plausibility check</p>
      </div>

      <NavTabs surveyConfigId={id} active="plausibility" />

      <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Select date range</h2>
          <a
            href={exportUrl}
            className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
          >
            Download CSV for ENA
          </a>
        </div>
        <DateRangeForm surveyConfigId={id} from={rangeFrom} to={rangeTo} />
      </section>

      {report.meta.totalRecords === 0 ? (
        <p className="text-sm text-neutral-500">No children in this date range.</p>
      ) : (
        <ReportRender report={report} />
      )}
    </div>
  );
}
