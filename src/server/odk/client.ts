/**
 * Minimal ODK Central REST/OData client, replacing the Python `pyodk`
 * dependency used in the original notebook. Two things it must replicate
 * exactly from `client.submissions.get_table(form_id=..., table_name=...)`:
 *
 *  - The root submissions table is fetched from the form's OData service.
 *  - Repeat groups (e.g. "Submissions.not_absent_hh.smart_survey.members")
 *    are fetched as their own OData entity set, navigable by the same
 *    dot-path pyodk uses as `table_name`.
 *
 * Networking is a hybrid of fetch (HTTP/1.1) and a raw HTTP/2 fallback,
 * diagnosed against the real server:
 *  - Large responses (the root Submissions table, the members repeat) are
 *    fine and reasonably fast over plain `fetch`.
 *  - Some small OData repeat-table routes (e.g. left_list) hang
 *    indefinitely under HTTP/1.1 -- reproduced with both `fetch` and
 *    `curl --http1.1` -- while a plain HTTP/2 request to the exact same URL
 *    answers in well under a second. HTTP/2 over Node's raw `http2` module
 *    is, in turn, much slower for the LARGE responses (and hangs entirely
 *    if an Accept-Encoding header is sent), so it isn't a safe universal
 *    replacement for fetch -- it's used only as a fallback when fetch
 *    itself times out.
 *
 * DNS resolution for the ODK host is done through a small set of public
 * resolvers (see `reliableLookup` below) rather than trusting whatever the
 * OS/router resolver is configured to use, falling back to the OS resolver
 * only if every public one fails. This was added after repeatedly hitting
 * `ENOTFOUND` for this exact hostname while a public resolver answered
 * correctly at the same moment every time -- a flaky home-router/ISP DNS
 * forwarder, not a real outage of the ODK server. Retrying on the OS
 * resolver alone has no ceiling that reliably rides that out; resolving
 * independently of it does.
 */
import * as http2 from "node:http2";
import { Resolver as DnsResolver, lookup as osLookup } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import type { LookupFunction } from "node:net";

export type OdkSession = {
  baseUrl: string;
  token: string;
};

export class OdkAuthError extends Error {}
export class OdkRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type SimpleResponse = {
  status: number;
  ok: boolean;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

// fetch is only ever given one quick shot below (see `request()`) -- when
// this server is behaving normally it answers fast, but we now know a real
// authenticated response can be genuinely slow (severely throttled
// throughput, not a stall -- confirmed by directly capturing data still
// arriving, just a few hundred bytes at a time, well past a minute in).
// fetch's AbortSignal is a hard total-duration deadline with no idle
// variant, so it can't safely be given a long budget without also risking
// killing a still-working transfer; that's what the HTTP/2 path below (an
// IDLE timeout) is for instead.
const FETCH_TIMEOUT_MS = 30_000;
const HTTP2_IDLE_TIMEOUT_MS = 30_000;
const HTTP2_HARD_TIMEOUT_MS = 10 * 60_000;

const publicDnsResolver = new DnsResolver();
publicDnsResolver.setServers(["1.1.1.1", "8.8.8.8"]);

/** A `dns.lookup`-compatible resolver (usable as `net.connect`'s `lookup`
 * option, which both `http2.connect` and undici's `Agent` accept) that
 * tries a couple of public DNS resolvers first and only falls back to
 * whatever the OS/router resolver says if those fail too.
 *
 * Must handle BOTH calling conventions `net.connect` can use: a single
 * `(err, address, family)` callback, or -- when Happy Eyeballs/dual-stack
 * connecting requests every address at once via `options.all` -- an
 * `(err, addresses[])` callback of `{address, family}` objects. Always
 * replying in the single-address form (the first version of this function
 * did) silently corrupts the "all" case: the caller iterates the returned
 * string character-by-character expecting address objects, which is
 * exactly the "Invalid IP address: undefined" failure this replaced. */
const reliableLookup: LookupFunction = (hostname, options, callback) => {
  const opts = typeof options === "function" ? {} : options;
  const cb = typeof options === "function" ? options : callback!;
  const wantsAll = typeof opts === "object" && opts !== null && "all" in opts && opts.all === true;

  publicDnsResolver.resolve4(hostname, (err, addresses) => {
    if (!err && addresses.length > 0) {
      if (wantsAll) {
        cb(null, addresses.map((address) => ({ address, family: 4 })));
      } else {
        cb(null, addresses[0], 4);
      }
      return;
    }
    osLookup(hostname, opts as never, cb as never);
  });
};

const dnsAwareAgent = new Agent({ connect: { lookup: reliableLookup } });

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Raw HTTP/2 GET/POST, no Accept-Encoding (sending one makes some large
 * responses from this server hang -- fine since this path is only used as
 * a fallback for small responses).
 *
 * Uses an IDLE timeout (reset on every byte received), not a total-duration
 * timeout. Measured directly against this server: a real authenticated
 * request genuinely streams data the whole time, just at severely
 * throttled throughput (~875 B/s observed) -- not a stall, not a dead
 * connection. A total timeout kills a transfer that is still actively
 * working; an idle timeout only gives up once data genuinely stops
 * arriving, so a slow-but-progressing response is allowed to finish
 * instead of being repeatedly restarted from zero (which never helped,
 * since a fresh connection over the same throttled link is just as slow). */
function http2Request(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<SimpleResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const session = http2.connect(url.origin, { lookup: reliableLookup });
    let settled = false;
    let idleTimer: ReturnType<typeof setTimeout>;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(hardCeiling);
      session.destroy();
      reject(err);
    };

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => fail(new Error(`HTTP/2 request idle for ${HTTP2_IDLE_TIMEOUT_MS / 1000}s with no data (${urlStr})`)),
        HTTP2_IDLE_TIMEOUT_MS,
      );
    };
    resetIdleTimer();

    // Still cap the absolute worst case -- a connection that dribbles just
    // enough data to keep resetting the idle timer forever shouldn't hang
    // indefinitely either.
    const hardCeiling = setTimeout(
      () => fail(new Error(`HTTP/2 request exceeded overall ${HTTP2_HARD_TIMEOUT_MS / 1000}s cap (${urlStr})`)),
      HTTP2_HARD_TIMEOUT_MS,
    );

    session.on("error", fail);

    const req = session.request({
      ":method": options.method ?? "GET",
      ":path": url.pathname + url.search,
      ...options.headers,
    });

    let status = 0;
    const chunks: Buffer[] = [];

    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
      resetIdleTimer();
    });
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      resetIdleTimer();
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(hardCeiling);
      session.close();
      const bodyText = Buffer.concat(chunks).toString("utf8");
      resolve({
        status,
        ok: status >= 200 && status < 300,
        json: async () => JSON.parse(bodyText),
        text: async () => bodyText,
      });
    });
    req.on("error", fail);

    if (options.body) req.end(options.body);
    else req.end();
  });
}

async function fetchOnce(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<SimpleResponse> {
  const res = await undiciFetch(urlStr, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    dispatcher: dnsAwareAgent,
  });
  const bodyText = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
  };
}

/** A DNS resolution failure for this specific ODK host has, in practice,
 * come and gone anywhere from ~10s up to at least a minute (a flaky
 * home-network/ISP DNS resolver, not this server or this app) --
 * distinguishable because it fails near-instantly (no 90s wait) with
 * ENOTFOUND/EAI_AGAIN, on EVERY transport, since fetch, the HTTP/2
 * fallback, and Node's own DNS lookup all resolve hostnames the same
 * OS-level way. Falling back to HTTP/2 for this kind of failure is
 * pointless -- it hits the identical DNS failure -- so a DNS-looking
 * failure instead gets several delayed retries on the same transport,
 * giving the resolver blip real time to clear. Each failed attempt costs
 * only milliseconds, so a generous total budget here is cheap in the
 * failure case and free in the (overwhelmingly common) success case. */
function isDnsFailure(err: unknown): boolean {
  const cause = err instanceof Error ? (err as { cause?: { code?: string } }).cause : undefined;
  const text = `${err instanceof Error ? err.message : String(err)} ${cause?.code ?? ""}`;
  return /ENOTFOUND|EAI_AGAIN/.test(text);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DNS_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 10_000, 10_000, 15_000, 15_000];

/** fetch gets ONE quick attempt, then -- unless the failure looks DNS-shaped
 * (worth its own delayed retries; see `isDnsFailure`) -- control goes
 * straight to the idle-tolerant HTTP/2 path in `http2Request`, with no
 * repeated fresh-connection retries in between.
 *
 * That used to retry fetch itself a few times on a fresh connection before
 * falling back. Direct measurement against this server showed why that
 * doesn't help: a real authenticated response streams in continuously, just
 * severely throttled (well under 1 KB/s observed), not stalled -- so a
 * fresh connection is exactly as slow as the one that "failed," and each
 * retry just re-pays the full timeout for zero benefit while discarding
 * whatever had already arrived. fetch's AbortSignal is a hard
 * total-duration deadline with no idle variant, so it can't safely be
 * given the long budget a slow-but-real transfer needs without also
 * risking killing one that's still working -- that's what `http2Request`'s
 * idle timeout is for instead.
 *
 * Critically, the body must be fully read *inside* the try block: the
 * timeout signal stays armed for the whole fetch lifecycle, and a
 * response's headers can arrive well before its body finishes streaming.
 * Returning a lazy `res.json()`/`res.text()` wrapper let an abort during
 * body-read happen *after* this function had already returned
 * successfully, outside any catch -- so the fallback never triggered even
 * though the request ultimately failed. */
async function request(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<SimpleResponse> {
  let lastErr: unknown;
  try {
    return await fetchOnce(urlStr, options);
  } catch (err) {
    lastErr = err;
  }

  if (isDnsFailure(lastErr)) {
    for (const delay of DNS_RETRY_DELAYS_MS) {
      await sleep(delay);
      try {
        return await fetchOnce(urlStr, options);
      } catch (err) {
        lastErr = err;
      }
    }
  }

  try {
    return await http2Request(urlStr, options);
  } catch (err) {
    lastErr = err;
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Request failed after retries (${urlStr}): ${detail}`);
}

/** Exchange an ODK Central user's email/password for a bearer session token. */
export async function createOdkSession(
  baseUrl: string,
  email: string,
  password: string,
): Promise<{ token: string; expiresAt: Date }> {
  const res = await request(`${trimTrailingSlash(baseUrl)}/v1/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (res.status === 401 || res.status === 400) {
    throw new OdkAuthError("Invalid ODK Central email or password.");
  }
  if (!res.ok) {
    throw new OdkRequestError(`ODK Central session request failed: ${res.status}`, res.status);
  }

  const body = (await res.json()) as { token: string; expiresAt: string };
  return { token: body.token, expiresAt: new Date(body.expiresAt) };
}

async function odkFetch(session: OdkSession, path: string): Promise<SimpleResponse> {
  const res = await request(`${trimTrailingSlash(session.baseUrl)}${path}`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new OdkAuthError("ODK Central session expired or unauthorized.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OdkRequestError(`ODK Central request failed (${res.status}): ${text}`, res.status);
  }
  return res;
}

/**
 * Fetch every row of an OData entity set (a form's root Submissions table,
 * or a dot-path repeat group within it), following @odata.nextLink pages.
 *
 * `pageSize` forces an explicit `$top` on the first request. Without it,
 * some repeat tables (in practice, the "members" table -- thousands of
 * nested rows for a full round) come back as a single giant response that's
 * prone to timing out over both fetch and the HTTP/2 fallback; requesting
 * it in smaller pages keeps each individual request small enough to
 * transfer reliably even on a slow/flaky connection to the ODK server.
 * ODK Central's OData implementation carries `$top` forward on
 * `@odata.nextLink` automatically, so later pages stay capped too.
 *
 * `filter` is an OData `$filter` expression -- confirmed working ONLY on
 * the root "Submissions" entity set, filtering on `__system/submissionDate`
 * (the server rejects filtering on form-defined fields like
 * `identification/survey_date` with a 501, and rejects
 * `__system/submissionDate` itself on nested repeat entity sets the same
 * way). Measured directly against this server: with a form holding 10,677
 * total submissions across every round ever collected, but a survey config
 * scoped to ~19 days, this cut the root pull from 10,677 rows to the 1,359
 * actually needed -- an 8x reduction, and the only place a server-side date
 * filter is possible at all. Repeat tables (members, left_list, etc.) have
 * no such lever -- the caller still filters those client-side after
 * fetching everything.
 */
export async function getOdkTable(
  session: OdkSession,
  projectId: number,
  formId: string,
  tableName = "Submissions",
  pageSize?: number,
  onPage?: (rowsSoFar: number) => void,
  filter?: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const query = [pageSize ? `$top=${pageSize}` : null, filter ? `$filter=${encodeURIComponent(filter)}` : null]
    .filter((p): p is string => p !== null)
    .join("&");
  let path: string | null =
    `/v1/projects/${projectId}/forms/${encodeURIComponent(formId)}.svc/${tableName}` + (query ? `?${query}` : "");

  while (path) {
    const res = await odkFetch(session, path);
    const body = (await res.json()) as {
      value: Record<string, unknown>[];
      "@odata.nextLink"?: string;
    };
    rows.push(...body.value);
    onPage?.(rows.length);

    if (body["@odata.nextLink"]) {
      // nextLink is an absolute URL; strip the base so odkFetch can re-add it.
      const next = new URL(body["@odata.nextLink"]);
      path = next.pathname + next.search;
    } else {
      path = null;
    }
  }

  return rows;
}

/**
 * Downloads ODK Central's bulk "submissions.csv.zip" export for a form --
 * a single streamed file covering the root table and every repeat group at
 * once, instead of the paginated per-table OData JSON calls `getOdkTable`
 * makes. See csv-import.ts for why this exists and how the result gets
 * parsed. `attachments=false` skips media files this app never uses,
 * which otherwise bloats the export considerably.
 *
 * This deliberately does NOT go through the `request()`/`odkFetch` retry
 * machinery built for the OData JSON endpoints (DNS backoff, HTTP/2 idle
 * timeout, etc.) -- measured directly against the real server, this
 * endpoint answers in one plain request reliably and fast (a full-history
 * export downloaded in well under a minute), so that complexity isn't
 * needed here. It does still route DNS through the same reliable
 * resolver, since that fix is cheap and applies regardless of endpoint.
 */
async function downloadSubmissionsZipOnce(url: string, session: OdkSession): Promise<Buffer> {
  const res = await undiciFetch(url, {
    headers: { authorization: `Bearer ${session.token}` },
    dispatcher: dnsAwareAgent,
    signal: AbortSignal.timeout(5 * 60_000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new OdkAuthError("ODK Central session expired or unauthorized.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OdkRequestError(`ODK Central export request failed (${res.status}): ${text}`, res.status);
  }

  return Buffer.from(await res.arrayBuffer());
}

/** `fetch`'s generic "fetch failed" hides the actual reason (DNS, TLS,
 * connection reset, etc.) in `err.cause` -- surface that so a failure is
 * diagnosable from the pull job's error message alone instead of needing a
 * manual repro every time. */
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : null;
  return causeMsg ? `${err.message}: ${causeMsg}` : err.message;
}

export async function downloadSubmissionsZip(
  session: OdkSession,
  projectId: number,
  formId: string,
): Promise<Buffer> {
  const url = `${trimTrailingSlash(session.baseUrl)}/v1/projects/${projectId}/forms/${encodeURIComponent(formId)}/submissions.csv.zip?attachments=false`;

  try {
    return await downloadSubmissionsZipOnce(url, session);
  } catch (err) {
    if (err instanceof OdkAuthError || err instanceof OdkRequestError) throw err;
    // One retry on a fresh connection -- measured directly against this
    // server, this endpoint is normally reliable, so a failure here is more
    // likely a transient blip than a persistent problem.
    try {
      return await downloadSubmissionsZipOnce(url, session);
    } catch (err2) {
      if (err2 instanceof OdkAuthError || err2 instanceof OdkRequestError) throw err2;
      throw new Error(`Export download failed after retry (${url}): ${describeFetchError(err2)}`);
    }
  }
}

/** List forms in a project, to help a user pick form ids when setting up a survey config. */
export async function listOdkForms(
  session: OdkSession,
  projectId: number,
): Promise<{ xmlFormId: string; name: string | null }[]> {
  const res = await odkFetch(session, `/v1/projects/${projectId}/forms`);
  const forms = (await res.json()) as { xmlFormId: string; name: string | null }[];
  return forms;
}

/** Deep link to a specific submission in the ODK Central web UI (read-only
 * detail page) -- kept for reference/fallback; the app's own links use
 * `getSubmissionEditUrl` below to jump straight into edit mode instead. */
export function odkSubmissionUrl(
  baseUrl: string,
  projectId: number,
  formId: string,
  odkId: string,
): string {
  return `${trimTrailingSlash(baseUrl)}/#/projects/${projectId}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(odkId)}`;
}

/** Href for an "Open in ODK Central" link that lands in edit mode -- points
 * at this app's own /api/survey-configs/[id]/odk-edit route (see
 * getSubmissionEditUrl below), not at ODK Central directly, since the real
 * Enketo edit URL has to be fetched fresh with the current user's session. */
export function odkEditHref(surveyConfigId: string, formId: string, odkId: string): string {
  const params = new URLSearchParams({ formId, odkId });
  return `/api/survey-configs/${surveyConfigId}/odk-edit?${params.toString()}`;
}

/**
 * Fetches the Enketo edit-webform URL for a submission from ODK Central's
 * own API (`GET .../submissions/:instanceId/edit`), so "Open in ODK
 * Central" can jump straight into edit mode instead of the read-only
 * submission detail page.
 *
 * Confirmed directly against a real server: this endpoint does NOT return
 * JSON -- it's a 302 whose `Location` header is the actual Enketo edit URL
 * (e.g. `https://.../-/edit/<webformId>?instance_id=...&return_url=...`).
 * Must be fetched with `redirect: "manual"` and the Location header read
 * off the redirect response itself; letting fetch auto-follow it instead
 * returns Enketo's rendered edit-form HTML (200 OK), which looks like a
 * plausible response but is useless here -- that page is meant to be
 * loaded by the *browser* (which establishes its own Enketo session when
 * it requests that URL), not fetched server-side and relayed. Not routed
 * through `odkFetch`/`request()` (the DNS-retry/HTTP2-fallback machinery
 * built for bulk pulls) since this is a single small interactive request
 * where that complexity isn't needed, and manual-redirect handling doesn't
 * fit `request()`'s current shape.
 */
export async function getSubmissionEditUrl(
  session: OdkSession,
  projectId: number,
  formId: string,
  instanceId: string,
): Promise<string> {
  const url = `${trimTrailingSlash(session.baseUrl)}/v1/projects/${projectId}/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(instanceId)}/edit`;
  const res = await undiciFetch(url, {
    headers: { authorization: `Bearer ${session.token}` },
    redirect: "manual",
  });

  if (res.status === 401 || res.status === 403) {
    throw new OdkAuthError("ODK Central session expired or unauthorized.");
  }
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    return new URL(location, url).toString();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OdkRequestError(`ODK Central edit-URL request failed (${res.status}): ${text.slice(0, 200)}`, res.status);
  }
  throw new Error(`ODK Central's edit endpoint didn't redirect as expected (status ${res.status}, no Location header).`);
}

export async function listOdkProjects(
  session: OdkSession,
): Promise<{ id: number; name: string }[]> {
  const res = await odkFetch(session, `/v1/projects`);
  return (await res.json()) as { id: number; name: string }[];
}
