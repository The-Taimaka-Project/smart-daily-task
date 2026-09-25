import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { establishOdkSession } from "@/server/odk/session-store";

/** This org only ever runs against one ODK Central server, so it isn't a
 * field on the (now single) login form -- change here if that ever stops
 * being true. */
export const ODK_BASE_URL = "https://taimaka-internal.org:7443";

/**
 * There's no local app password: signing in to this app IS connecting ODK
 * Central. `authorize` validates the entered email/password directly
 * against ODK Central's own /v1/sessions endpoint (via establishOdkSession,
 * which stores the resulting bearer token encrypted, never the password),
 * and finds-or-creates a `users` row by email purely for attributing
 * created_by/reviewed_by/etc. fields elsewhere in the app.
 *
 * `maxAge` matches ODK Central's own session token lifetime (24h) so the
 * app session and the ODK connection expire together -- one login covers
 * both, and a expired-either-way session just means logging in again.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required for self-hosted deployments (Coolify, Docker, etc.) that aren't
  // on Vercel -- Auth.js otherwise rejects the request's Host header.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "ODK Central email", type: "email" },
        password: { label: "ODK Central password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;
        const normalizedEmail = email.toLowerCase().trim();

        const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) });
        const user = existing ?? (await db.insert(users).values({ email: normalizedEmail }).returning())[0];

        try {
          await establishOdkSession(user.id, ODK_BASE_URL, email, password);
        } catch {
          // Wrong ODK Central credentials, or ODK Central unreachable --
          // either way, this login attempt fails. A brand-new user row
          // created above with no session ever attached is harmless
          // (just an unused row), not worth rolling back specially.
          return null;
        }

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) token.id = user.id;
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
