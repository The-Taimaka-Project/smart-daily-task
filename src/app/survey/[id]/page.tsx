import { notFound } from "next/navigation";
import { getSurveyConfig, updateTargetSampleSize } from "@/server/actions/survey-configs";
import { loadChildren, loadHouseholds, loadHouseholdMembers, countTargetClusters } from "@/server/queries/survey-data";
import { computeClusterCount, computeSampleSizeAchieved } from "@/server/pipeline/sample-progress";
import { PullControls } from "./pull-controls";
import { NavTabs } from "./nav-tabs";
import { ManualCorrectionsSection } from "./manual-corrections-section";
import { ManualExclusionsSection } from "./manual-exclusions-section";

export default async function SurveyOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const config = await getSurveyConfig(id);
  if (!config) notFound();

  const [households, children, householdMembers, targetClusters] = await Promise.all([
    loadHouseholds(id),
    loadChildren(id),
    loadHouseholdMembers(id),
    countTargetClusters(id),
  ]);

  const clusterCount = computeClusterCount(children);
  const clusterCoveredPct = targetClusters ? Math.round((clusterCount * 100) / targetClusters) : null;
  const { achieved, achievedPct, u5Count } = computeSampleSizeAchieved(
    householdMembers,
    config.targetSampleSize,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{config.name}</h1>
        <p className="text-sm text-neutral-500">
          {config.dateFrom} → {config.dateTo} · {households.length} households · {children.length} children
        </p>
      </div>

      <NavTabs surveyConfigId={id} active="overview" />

      <PullControls surveyConfigId={id} />

      <section className="mb-6 rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-2 text-lg font-semibold">Progress</h2>
        <p className="text-sm">
          Clusters covered:{" "}
          <span className="font-medium">
            {clusterCount}/{targetClusters}
          </span>
          {clusterCoveredPct !== null && <span> ({clusterCoveredPct}%)</span>}
        </p>
        <p className="text-sm">
          Sample size achieved (age &lt;5, mortality-adjusted): <span className="font-medium">{achieved.toFixed(1)}</span>
          {" "}({u5Count} under-5 members recorded)
          {achievedPct !== null && (
            <span>
              {" "}
              -- <span className="font-bold">{achievedPct}%</span> of target ({config.targetSampleSize})
            </span>
          )}
        </p>
        {config.targetSampleSize === null && (
          <form action={updateTargetSampleSize.bind(null, id)} className="mt-2 flex items-center gap-2 text-sm">
            <label>
              Set target sample size to see % achieved:
              <input
                type="number"
                name="targetSampleSize"
                className="ml-2 w-28 rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <button type="submit" className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700">
              Save
            </button>
          </form>
        )}
      </section>

      <ManualCorrectionsSection surveyConfigId={id} />
      <ManualExclusionsSection surveyConfigId={id} />
    </div>
  );
}
