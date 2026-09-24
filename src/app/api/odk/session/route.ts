import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  clearOdkSession,
  establishOdkSession,
  getOdkSessionForUser,
} from "@/server/odk/session-store";
import { OdkAuthError, OdkRequestError } from "@/server/odk/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ status: "unauthenticated" }, { status: 401 });

  const odkState = await getOdkSessionForUser(session.user.id);
  return NextResponse.json(odkState);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json()) as { baseUrl?: string; email?: string; password?: string };
  const { baseUrl, email, password } = body;
  if (!baseUrl || !email || !password) {
    return NextResponse.json({ error: "baseUrl, email, and password are required." }, { status: 400 });
  }

  try {
    await establishOdkSession(session.user.id, baseUrl, email, password);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof OdkAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof OdkRequestError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Unexpected error connecting to ODK Central." }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  await clearOdkSession(session.user.id);
  return NextResponse.json({ ok: true });
}
