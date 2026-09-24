/**
 * Port of the outlier-handling half of `plausibility_format` in
 * smart_functions.py, plus the hard drop-filter applied later in the
 * notebook. Two distinct steps, in this order:
 *
 *  1. Sentinel-value cleanup: specific values (150/200cm for height, 260mm
 *     for MUAC, 30kg for weight) are treated as device/entry placeholders,
 *     not real measurements, and nulled out rather than treated as extreme.
 *  2. Hard implausibility bounds: after step 1, anything still outside
 *     height 40-150cm, weight 1.5-30.1kg, or MUAC 60-264mm is dropped from
 *     the analysis dataset entirely (not just flagged).
 *
 * MUAC is in millimeters here throughout, matching the `children.muacMm`
 * column (the notebook converts MUAC from cm to mm early: `* 10`).
 */

export function muacCmToMm(muacCm: number): number {
  return Math.round(muacCm * 10);
}

export function cleanAnthropometricSentinels<
  T extends { heightCm: number | null; weightKg: number | null; muacMm: number | null },
>(child: T): T {
  const heightCm =
    child.heightCm !== null && (child.heightCm === 150 || child.heightCm === 200)
      ? null
      : child.heightCm;
  const weightKg = child.weightKg !== null && child.weightKg === 30 ? null : child.weightKg;
  const muacMm = child.muacMm !== null && child.muacMm === 260 ? null : child.muacMm;

  return { ...child, heightCm, weightKg, muacMm };
}

export function isImplausibleAnthropometry(child: {
  heightCm: number | null;
  weightKg: number | null;
  muacMm: number | null;
}): boolean {
  const heightOut =
    child.heightCm !== null && (child.heightCm > 150 || child.heightCm < 40);
  const weightOut =
    child.weightKg !== null && (child.weightKg < 1.5 || child.weightKg > 30.1);
  const muacOut = child.muacMm !== null && (child.muacMm < 60 || child.muacMm >= 265);
  return heightOut || weightOut || muacOut;
}
