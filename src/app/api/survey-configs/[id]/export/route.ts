import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { clusterAssignments } from "@/server/db/schema";
import { loadChildren, loadHouseholds } from "@/server/queries/survey-data";
import { buildPlausibilityRows, rowsToCsv } from "@/server/pipeline/plausibility-export";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const [households, childRecords, clusterRows] = await Promise.all([
    loadHouseholds(id),
    loadChildren(id),
    db.query.clusterAssignments.findMany({ where: eq(clusterAssignments.surveyConfigId, id) }),
  ]);

  const rows = buildPlausibilityRows(childRecords, households, clusterRows, { from, to });
  const csv = rowsToCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="plausibility_check_${id}${from ? `_${from}_${to}` : ""}.csv"`,
    },
  });
}
