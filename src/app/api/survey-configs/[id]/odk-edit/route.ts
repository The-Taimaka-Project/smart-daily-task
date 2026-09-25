import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSurveyConfig } from "@/server/actions/survey-configs";
import { getOdkSessionForUser } from "@/server/odk/session-store";
import { getSubmissionEditUrl } from "@/server/odk/client";

/**
 * "Open in ODK Central" links point here instead of directly at a static
 * ODK Central URL, because the actual Enketo edit-webform link is dynamic
 * (ODK Central mints a short-lived one on request) and requires the current
 * user's own ODK session to fetch -- this route does that fetch server-side
 * and 302s straight to it.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: surveyConfigId } = await params;
  const { searchParams } = new URL(req.url);
  const formId = searchParams.get("formId");
  const odkId = searchParams.get("odkId");
  if (!formId || !odkId) {
    return NextResponse.json({ error: "Missing formId or odkId" }, { status: 400 });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const config = await getSurveyConfig(surveyConfigId);
  if (!config) return NextResponse.json({ error: "Survey not found" }, { status: 404 });

  const odkState = await getOdkSessionForUser(session.user.id);
  if (odkState.status !== "active") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const editUrl = await getSubmissionEditUrl(odkState.session, config.odkProjectId, formId, odkId);
    return NextResponse.redirect(editUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get ODK Central edit URL" },
      { status: 502 },
    );
  }
}
