"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid ODK Central email or password.");
      return;
    }
    router.push(params.get("callbackUrl") ?? "/");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-2 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Use your ODK Central email and password -- there&apos;s no separate app password. Signing
        in here also connects your ODK Central account for pulling data. Your password is sent
        straight to ODK Central to check and is never stored; only the resulting session token is
        (encrypted). Sessions last 24 hours, so you&apos;ll sign in again about once a day.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          ODK Central email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ODK Central password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
