/**
 * ODK Central's OData JSON represents XLSForm groups as nested objects
 * (e.g. a "identification" group with a "team_number" field inside becomes
 * `{ identification: { team_number: ... } }`). `deepGet` reads one of these
 * nested fields by a dot-path, e.g. `deepGet(record, "identification.team_number")`.
 *
 * Path segments below are taken directly from a real exported submission's
 * CSV column names (see reference/../smart_round3_example_dataset), with
 * the CSV's "-" group separator translated to ".".
 */
export function deepGet(obj: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Treats ODK boolean-like values tolerantly: real booleans, or the strings/values ODK exports. */
export function toBoolLike(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "y" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "n" || s === "no") return false;
  return null;
}

export function toNumberLike(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? null : n;
}

export function toStringLike(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}
