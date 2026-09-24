/**
 * Parses ODK Central's bulk "submissions.csv.zip" export -- the same file
 * you'd get clicking "Export" in ODK Central's own UI -- into the same raw
 * nested-object shape the rest of this pipeline already expects from the
 * OData JSON API (see field-paths.ts / extract-*.ts).
 *
 * Why this exists: the paginated OData JSON API (src/server/odk/client.ts)
 * repeatedly hung or errored on the "members" repeat table specifically,
 * confirmed independent of client implementation (both a hand-rolled
 * HTTP/2 client and undici's separate one stalled). The bulk export is a
 * completely different code path on the ODK Central server -- a single
 * streamed file instead of thousands of small paginated queries -- and
 * measured directly against the real server, it downloaded the form's
 * entire history (10,677 submissions, every repeat table) as one ~2.7MB
 * zip in under 40 seconds, where the paginated approach could take many
 * minutes per page and never reliably finish "members" at all.
 *
 * ODK Central's CSV export flattens each group into columns joined by "-"
 * (e.g. "identification-team_number"), which is exactly the "-"-for-"."
 * translation already documented in field-paths.ts/deep-get.ts for the CSV
 * samples in reference/ -- so rebuilding that nesting here means every
 * existing extract-*.ts function (all written against dot-paths via
 * `deepGet`) works completely unchanged against CSV-sourced data too.
 */
import AdmZip from "adm-zip";
import Papa from "papaparse";

/** Every CSV file in the zip, keyed by filename without the ".csv"
 * extension (e.g. "smart_round3" for the root table, "smart_round3-members"
 * for the members repeat group) -- matching ODK Central's own naming,
 * confirmed directly against a real export. */
export function parseSubmissionsZip(zipBuffer: Buffer): Map<string, Record<string, string>[]> {
  const zip = new AdmZip(zipBuffer);
  const tables = new Map<string, Record<string, string>[]>();

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith(".csv")) continue;
    const name = entry.entryName.replace(/\.csv$/i, "");
    const text = entry.getData().toString("utf8");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    tables.set(name, parsed.data);
  }

  return tables;
}

/**
 * Rebuilds one CSV row's flat, "-"-joined columns into the nested-object
 * shape `deepGet`/the extract-*.ts functions expect from OData JSON --
 * e.g. `{"identification-team_number": "4"}` becomes
 * `{identification: {team_number: "4"}}`.
 *
 * `KEY`/`PARENT_KEY` are ODK Central's CSV names for the submission's own
 * id and (for a repeat row) its parent submission's id -- these aren't
 * part of the form's own field structure, so they're special-cased to the
 * flat `__id`/`__Submissions-id` fields SYSTEM_PATHS already expects from
 * the OData JSON shape, instead of being nested like a real form field.
 */
export function csvRowToRaw(row: Record<string, string>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === "KEY") {
      raw.__id = value;
      continue;
    }
    if (key === "PARENT_KEY") {
      raw["__Submissions-id"] = value;
      continue;
    }

    const segments = key.split("-");
    let node = raw;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const existing = node[segment];
      if (typeof existing !== "object" || existing === null) {
        node[segment] = {};
      }
      node = node[segment] as Record<string, unknown>;
    }
    node[segments[segments.length - 1]] = value;
  }

  // The CSV export flattens a "geopoint" question into separate
  // Latitude/Longitude/Altitude/Accuracy columns, unlike the OData JSON
  // shape's GeoJSON-style `coordinates` array (see field-paths.ts).
  // Synthesizing that array here means extract-household.ts's
  // `hasGeopoint` check needs no CSV-specific branch of its own.
  const geopoint = raw.geopoint as Record<string, unknown> | undefined;
  if (geopoint && typeof geopoint === "object") {
    // `Number("")` is 0, not NaN -- an unrecorded geopoint leaves these CSV
    // cells as empty strings, and coercing them directly would synthesize a
    // fake [0, 0, 0] coordinate that then passed `hasGeopoint`, quietly
    // pushing every team's geopoint-completeness ratio toward 100% even on
    // dates where enumerators plainly hadn't recorded a geopoint at all.
    const toFiniteOrNaN = (v: unknown): number => {
      const s = typeof v === "string" ? v.trim() : v;
      if (s === "" || s === null || s === undefined) return NaN;
      return Number(s);
    };
    const lon = toFiniteOrNaN(geopoint.Longitude);
    const lat = toFiniteOrNaN(geopoint.Latitude);
    const alt = toFiniteOrNaN(geopoint.Altitude);
    if (!Number.isNaN(lon) && !Number.isNaN(lat)) {
      geopoint.coordinates = [lon, lat, Number.isNaN(alt) ? 0 : alt];
    }
  }

  return raw;
}
