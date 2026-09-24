import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { odkSessions } from "@/server/db/schema";
import { encryptSecret, decryptSecret } from "@/server/security/crypto";
import { createOdkSession, type OdkSession } from "./client";

/**
 * Persists only the ODK Central bearer token (encrypted), never the
 * password. The password is used in-memory for the single exchange call in
 * `establishOdkSession` and then discarded.
 */
export async function establishOdkSession(
  appUserId: string,
  baseUrl: string,
  odkEmail: string,
  odkPassword: string,
): Promise<void> {
  const { token, expiresAt } = await createOdkSession(baseUrl, odkEmail, odkPassword);

  await db
    .insert(odkSessions)
    .values({
      userId: appUserId,
      odkBaseUrl: baseUrl,
      odkEmail,
      encryptedToken: encryptSecret(token),
      expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: odkSessions.userId,
      set: {
        odkBaseUrl: baseUrl,
        odkEmail,
        encryptedToken: encryptSecret(token),
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

export type OdkSessionState =
  | { status: "none" }
  | { status: "expired" }
  | { status: "active"; session: OdkSession; odkEmail: string };

export async function getOdkSessionForUser(appUserId: string): Promise<OdkSessionState> {
  const row = await db.query.odkSessions.findFirst({
    where: eq(odkSessions.userId, appUserId),
  });
  if (!row) return { status: "none" };
  if (row.expiresAt.getTime() <= Date.now()) return { status: "expired" };

  return {
    status: "active",
    session: { baseUrl: row.odkBaseUrl, token: decryptSecret(row.encryptedToken) },
    odkEmail: row.odkEmail,
  };
}

export async function clearOdkSession(appUserId: string): Promise<void> {
  await db.delete(odkSessions).where(eq(odkSessions.userId, appUserId));
}
