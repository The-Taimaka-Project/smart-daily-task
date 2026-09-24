import { notFound } from "next/navigation";
import { getSurveyConfig } from "@/server/actions/survey-configs";
import { listTypoLogReviews } from "@/server/actions/typo-log-reviews";
import { loadChildren, loadHouseholds } from "@/server/queries/survey-data";
import { computeTypoLogRows, type TypoLogRow } from "@/server/pipeline/typo-log";
import { deepGet, toStringLike } from "@/server/odk/deep-get";
import { CHILD_PATHS } from "@/server/pipeline/field-paths";
import { odkEditHref } from "@/server/odk/client";
import { NavTabs } from "../nav-tabs";
import { TypoLogList, type TypoLogRowWithReview } from "./typo-log-list";

export default async function TypoLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const config = await getSurveyConfig(id);
  if (!config) notFound();

  const [children, households, reviews] = await Promise.all([
    loadChildren(id),
    loadHouseholds(id),
    listTypoLogReviews(id),
  ]);

  const childByOdkKey = new Map(children.map((c) => [c.odkChildKey, c]));
  const householdFormIdByOdkId = new Map(households.map((h) => [h.odkId, h.formId]));
  const reviewByOdkId = new Map(reviews.map((r) => [r.targetOdkId, r]));

  const flaggedRows = computeTypoLogRows(children);
  const flaggedKeys = new Set(flaggedRows.map((r) => r.targetOdkId));

  // A row someone already started reviewing (or marked as a typo) that's no
  // longer a statistical outlier -- most likely because the value was
  // corrected in ODK since it was first flagged. Kept in the log instead of
  // silently disappearing, so the team has a durable record of typos found
  // and fixed, not just a live filter of what's currently flagged. Only
  // possible for a child that still exists in this pull -- if a correction
  // changed something enough that the child dropped out of the pipeline
  // entirely (e.g. an age correction crossing the 60-month cutoff), there's
  // no current data left to rebuild the row from.
  const resolvedRows: TypoLogRow[] = [];
  for (const review of reviews) {
    if (flaggedKeys.has(review.targetOdkId)) continue;
    const child = childByOdkKey.get(review.targetOdkId);
    if (!child) continue;
    resolvedRows.push({
      targetOdkId: child.odkChildKey,
      householdOdkId: child.householdOdkId,
      surveyDate: child.surveyDate,
      teamNumber: child.teamNumber,
      hhId: child.hhId,
      childId: child.childId,
      childName: null,
      flaggedIndices: [],
      explanation: "No longer a statistical outlier -- likely corrected since this was first flagged.",
      birthdate: child.birthdate,
      ageMonths: child.ageMonths,
      weightKg: child.weightKg,
      heightCm: child.heightCm,
      muacMm: child.muacMm,
      stillFlagged: false,
    });
  }

  const rows: TypoLogRowWithReview[] = [...flaggedRows, ...resolvedRows]
    .sort((a, b) => (a.surveyDate < b.surveyDate ? -1 : a.surveyDate > b.surveyDate ? 1 : 0))
    .map((row) => {
      const child = childByOdkKey.get(row.targetOdkId);
      const childName = child ? toStringLike(deepGet(child.raw, CHILD_PATHS.memberName)) : null;
      const review = reviewByOdkId.get(row.targetOdkId);
      const formId = householdFormIdByOdkId.get(row.householdOdkId) ?? config.mainFormId;
      const odkUrl = odkEditHref(id, formId, row.householdOdkId);
      return {
        ...row,
        childName,
        odkUrl,
        isTypo: review?.isTypo ?? null,
        correctBirthdate: review?.correctBirthdate ?? null,
        correctAgeMonths: review?.correctAgeMonths ?? null,
        correctWeightKg: review?.correctWeightKg ?? null,
        correctHeightCm: review?.correctHeightCm ?? null,
        correctMuacMm: review?.correctMuacMm ?? null,
        note: review?.note ?? null,
        daniRevise: review?.daniRevise ?? null,
      };
    });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{config.name}</h1>
        <p className="text-sm text-neutral-500">Log of typo</p>
      </div>

      <NavTabs surveyConfigId={id} active="typo-log" />

      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-1 text-lg font-semibold">Log of typo ({rows.length})</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Children whose WHZ, HAZ, or WAZ is a statistical outlier for this survey (WHO fixed-range,
          then flagged if still more than 3 SD from the observed mean). The explanation is this app&apos;s
          own heuristic based on which z-score(s) are flagged -- not an exact copy of ENA&apos;s internal
          logic -- always check the actual values yourself. If a corrected value differs from what was
          recorded, that cell is highlighted yellow. A row marked &quot;resolved&quot; was flagged
          before but isn&apos;t currently an outlier anymore -- it stays here so the log keeps a
          record of it, it doesn&apos;t just disappear once the data&apos;s corrected.
        </p>
        <TypoLogList surveyConfigId={id} rows={rows} />
      </section>
    </div>
  );
}
