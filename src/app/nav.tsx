"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function Nav() {
  const { data: session } = useSession();

  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold">
          SMART Survey Tool
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/">Surveys</Link>
          {session?.user?.email && (
            <span className="text-neutral-500">{session.user.email}</span>
          )}
          {session && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700"
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
