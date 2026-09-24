import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { clusterAssignments } from "@/server/db/schema";
import { getSurveyConfig } from "@/server/actions/survey-configs";
import { listItpReferralReviews } from "@/server/actions/itp-referral-reviews";
import { loadChildren, loadHouseholds, loadOutsideChildren } from "@/server/queries/survey-data";
import { buildOutsideItpReferrals, buildSampleItpReferrals } from "@/server/pipeline/itp-referral";
import { NavTabs } from "../nav-tabs";
import { ItpReferralList, type ItpReferralRowWithReview } from "../itp-referral-list";

export default async function ReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const config = await getSurveyConfig(id);
  if (!config) notFound();

  const [households, children, outsideChildren, itpReviews, clusterRows] = await Promise.all([
    loadHouseholds(id),
    loadChildren(id),
    loadOutsideChildren(id),
    listItpReferralReviews(id),
    db.query.clusterAssignments.findMany({ where: eq(clusterAssignments.surveyConfigId, id) }),
  ]);

  const householdByOdkId = new Map(households.map((h) => [h.odkId, h]));
  const clusterByKey = new Map(
    clusterRows.map((c) => [`${c.surveyDate} ${c.teamNumber} ${c.settlementName}`, c]),
  );
  const itpReviewByKey = new Map(itpReviews.map((r) => [`${r.targetKind}:${r.targetOdkId}`, r]));

  // ITP referrals from BOTH the main household sample (itp_sample) and the
  // separate outside-sample form (itp_outside), same as the notebook's
  // `itp = pd.concat([itp_sample, itp_outside])`.
  const itpRows: ItpReferralRowWithReview[] = [
    ...buildSampleItpReferrals(children, householdByOdkId, clusterByKey),
    ...buildOutsideItpReferrals(outsideChildren),
  ]
    .map((r) => {
      const review = itpReviewByKey.get(`${r.targetKind}:${r.targetOdkId}`);
      return { ...r, enrolled: review?.enrolled ?? null, note: review?.note ?? null, pid: review?.pid ?? null };
    })
    .sort((a, b) => ((a.surveyDate ?? "") < (b.surveyDate ?? "") ? -1 : 1));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{config.name}</h1>
        <p className="text-sm text-neutral-500">Referral</p>
      </div>

      <NavTabs surveyConfigId={id} active="referral" />

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-lg font-semibold">ITP referrals ({itpRows.length})</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Children flagged for ITP referral, from both the main household sample and the outside-sample
          form. Mark whether each was successfully enrolled -- your teammate&apos;s answer is shared here
          for everyone.
        </p>
        <ItpReferralList surveyConfigId={id} rows={itpRows} />
      </section>
    </div>
  );
}
