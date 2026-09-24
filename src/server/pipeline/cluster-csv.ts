import Papa from "papaparse";
import type { ClusterAssignmentRow } from "./types";

/**
 * Parses a cluster-number CSV like `reference/cluster_number_r3sa1.csv`:
 * header `survey_date,settlement_name,team_number,cluster_number,site,settlement`.
 * Column order in the source files varies by round, so this parses by
 * header name rather than position.
 */
export function parseClusterCsv(csvText: string): ClusterAssignmentRow[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    const messages = result.errors.map((e) => `row ${e.row}: ${e.message}`).join("; ");
    throw new Error(`Failed to parse cluster CSV: ${messages}`);
  }

  const required = ["survey_date", "settlement_name", "team_number", "cluster_number"];
  const header = result.meta.fields ?? [];
  const missing = required.filter((col) => !header.includes(col));
  if (missing.length > 0) {
    throw new Error(
      `Cluster CSV is missing required column(s): ${missing.join(", ")}. Found: ${header.join(", ")}`,
    );
  }

  return result.data
    .filter((row) => row.survey_date && row.team_number)
    .map((row) => ({
      surveyDate: normalizeDate(row.survey_date),
      teamNumber: parseInt(row.team_number, 10),
      settlementName: row.settlement_name?.trim(),
      clusterNumber: row.cluster_number?.trim(),
      site: row.site?.trim() || null,
      settlement: row.settlement?.trim() || null,
    }));
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  // Already ISO (yyyy-mm-dd)?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unrecognized date format in cluster CSV: "${value}"`);
  }
  return parsed.toISOString().slice(0, 10);
}
