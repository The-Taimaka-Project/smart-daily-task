/**
 * Biological-plausibility flagging for the ENA-equivalent report -- ported
 * from the reference implementation's who-standards.ts.
 */

/** Fixed-range flag (ENA defaults): WHZ +/-5, HAZ +/-6, WAZ -6/+5. */
export function whoFlag(z: number | null, kind: "WHZ" | "HAZ" | "WAZ"): boolean {
  if (z === null || !Number.isFinite(z)) return false;
  if (kind === "WHZ") return z < -5 || z > 5;
  if (kind === "HAZ") return z < -6 || z > 6;
  return z < -6 || z > 5; // WAZ
}

/**
 * SMART flag: exclude any value more than 3 RAW Z-SCORE UNITS from the
 * *observed* sample mean -- NOT scaled by the sample's own SD, and not
 * iterative. Confirmed directly against a real ENA report's own wording
 * ("-3 to 3 for WHZ/HAZ/WAZ, from observed mean") and its actual flagged
 * list on this exact dataset: WHZ matched ENA's 0.8% exactly once the
 * SD-scaling was removed, and iterating past a single pass (recomputing
 * the mean from what's left and re-flagging) moved HAZ further from ENA's
 * figure rather than closer, so ENA's own method is evidently a single
 * pass too.
 *
 * An earlier version of this function used `mean +/- 3*SD`, recomputed
 * iteratively until stable. That's a much WIDER threshold whenever the
 * sample's SD exceeds 1 (routine for HAZ/WAZ), and it silently
 * under-flagged real outliers -- confirmed by the fact that fixing this
 * took "Flagged for review" in Log of Typo from 20 rows to numbers
 * matching ENA's ~100.
 */
export function smartFlags(values: (number | null)[]): boolean[] {
  const flagged = values.map((v) => v === null || !Number.isFinite(v));
  const arr = values.map((v) => (v === null || !Number.isFinite(v) ? NaN : (v as number)));
  const kept = arr.filter((v, i) => !flagged[i] && Number.isFinite(v));
  if (kept.length < 2) return flagged;
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  return arr.map((v, i) => flagged[i] || v < mean - 3 || v > mean + 3);
}
