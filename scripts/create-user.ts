/**
 * CLI to create/reset an app user account. There is no public sign-up page
 * on purpose -- this is an internal tool for a small team, so accounts are
 * provisioned by whoever runs the app, not self-registered.
 *
 * Usage: npx tsx scripts/create-user.ts <email> <password> [name]
 */
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { users } from "../src/server/db/schema";

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-user.ts <email> <password> [name]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) });
  if (existing) {
    await db.update(users).set({ passwordHash, name: name ?? existing.name }).where(eq(users.id, existing.id));
    console.log(`Updated password for existing user ${normalizedEmail}`);
  } else {
    await db.insert(users).values({ email: normalizedEmail, passwordHash, name: name ?? null });
    console.log(`Created user ${normalizedEmail}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
