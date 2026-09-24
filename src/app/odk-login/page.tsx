"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listSurveyConfigs } from "@/server/actions/survey-configs";

type OdkState =
  | { status: "none" }
  | { status: "expired" }
  | { status: "active"; session: { baseUrl: string }; odkEmail: string };

export default function OdkLoginPage() {
  const router = useRouter();
  const [state, setState] = useState<OdkState | null>(null);
  const [baseUrl, setBaseUrl] = useState("https://taimaka-internal.org:7443");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const res = await fetch("/api/odk/session");
    if (res.ok) setState(await res.json());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/odk/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to connect to ODK Central.");
      return;
    }
    setPassword("");
    await refresh();

    // Once connected, skip straight to the survey (which now presents the
    // "Daily submission check" vs "Plausibility check" choice) instead of
    // leaving the user on this connection page.
    const configs = await listSurveyConfigs();
    router.push(configs.length === 1 ? `/survey/${configs[0].id}` : "/");
  }

  async function onDisconnect() {
    await fetch("/api/odk/session", { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-xl font-semibold">ODK Central connection</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Enter your own ODK Central login. It&apos;s used once to get a session token from ODK
        Central; your password is never stored -- only the token, encrypted, and only for you.
      </p>

      {state?.status === "active" && (
        <div className="mb-6 rounded border border-green-300 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
          Connected to {state.session.baseUrl} as {state.odkEmail}.{" "}
          <button onClick={onDisconnect} className="underline">
            Disconnect
          </button>
        </div>
      )}
      {state?.status === "expired" && (
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
          Your ODK Central session expired. Please reconnect below.
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          ODK Central server URL
          <input
            type="url"
            required
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
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
          {loading ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
