import cutoffsJson from "./wfh_cutoffs.json";

type Cutoff = {
  sdNeg5: number;
  sdNeg3: number;
  sdNeg2: number;
  sdNeg1_5: number;
  sd5: number;
};

const cutoffs = cutoffsJson as unknown as Record<string, Cutoff>;

/**
 * Direct weight-for-height cutoff lookup (WHO 2006 standard), keyed like
 * "bh-100" (boy, standing height, 100cm) or "gl-65.5" (girl, recumbent
 * length, 65.5cm) -- mirrors `wfh.csv` used by the existing Python
 * `get_anthro` function for SAM/MAM/healthy classification.
 */
export function lookupWfhCutoff(key: string): { sdNeg3: number; sdNeg2: number } | undefined {
  const row = cutoffs[key];
  if (!row) return undefined;
  return { sdNeg3: row.sdNeg3, sdNeg2: row.sdNeg2 };
}
