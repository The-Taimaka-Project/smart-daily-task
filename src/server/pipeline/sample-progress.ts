import type { HouseholdMemberRecord } from "./extract-household-member";
import type { ChildRecord } from "./types";

/**
 * Port of the "Check the progress so far" cell in the notebook:
 *
 *   df_concat_u5 = df_concat[df_concat['age_years_numeric'] < 5]
 *   sample_size_achieved = len(df_concat_u5) - 0.5*(len(left)+len(died)+len(join)+len(born))
 *   sample_size_achieved_pct = round(sample_size_achieved*100/2081)
 *
 * The 0.5 weighting is the standard SMART/demographic-survey adjustment for
 * partial-period exposure: someone who joined, left, was born, or died
 * partway through the recall period only counts as "half" a completed
 * observation.
 */
export function computeSampleSizeAchieved(
  members: HouseholdMemberRecord[],
  targetSampleSize: number | null,
): { achieved: number; achievedPct: number | null; u5Count: number } {
  const u5 = members.filter((m) => m.ageYears !== null && m.ageYears < 5);

  const leftCount = u5.filter((m) => m.leftFlag === "y").length;
  const diedCount = u5.filter((m) => m.diedFlag === "y").length;
  const joinCount = u5.filter((m) => m.joinFlag === "y").length;
  const bornCount = u5.filter((m) => m.bornFlag === "y").length;

  const achieved = u5.length - 0.5 * (leftCount + diedCount + joinCount + bornCount);
  const achievedPct = targetSampleSize ? Math.round((achieved * 100) / targetSampleSize) : null;

  return { achieved, achievedPct, u5Count: u5.length };
}

/** Number of distinct clusters represented among measured children (matches
 * the notebook's `len(df_final['cluster_number'].unique())`). */
export function computeClusterCount(children: ChildRecord[]): number {
  return new Set(children.map((c) => c.clusterNumber).filter((c): c is string => c !== null)).size;
}
