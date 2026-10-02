import { BoxlineConnectionError, BoxlineError, BoxlineTimeoutError, errorFromResponse, retryAfterSeconds } from "./errors.js";
import { VERSION } from "./version.js";

/** Options for one call; every SDK method takes them as its last argument. */
export interface RequestOptions {
  /** Time limit for this call in ms (for streams: until the response starts). Default: the client's `timeoutMs`. */
  timeoutMs?: number;
  /** Retries after a network error, 429 or 5xx (GETs, and POSTs with an Idempotency-Key). Default: the client's. */
  maxRetries?: number;
  /**
   * Idempotency-Key for the calls that create or start something (sessions, bulk, agent runs, crawls, API keys,
   * contexts, extension uploads). The SDK makes one per call by itself; pass your own to make a retry of your own safe too, e.g. a job id.
   */
  idempotencyKey?: string;
  /**
   * Your own id for this request (1–64 of A–Z a–z 0–9 . _ : -), to find it in your logs: sent as X-Client-Request-Id,
   * logged by the API next to its own id, and on errors as `clientRequestId`. The API's own id is `error.requestId`.
   */
  clientRequestId?: string;
  /** Aborting it stops the call (and any retries). */
  signal?: AbortSignal;
  /** Extra headers for this call. */
  headers?: Record<string, string>;
}

export interface CoreConfig {
  apiKey?: string;
  baseUrl: string;
  credentials?: RequestCredentials;
  fetch: typeof fetch;
  maxRetries: number;
  timeoutMs: number;
  headers: Record<string, string>;
}

/**
 * The POSTs whose Idempotency-Key the API honours (docs/CONTRACT.md "Idempotency keys"); only these are retried. `:id`
 * stands for one path segment.
 */
export const IDEMPOTENT_POSTS = new Set([
  "/v1/sessions",
  "/v1/sessions/bulk",
  "/v1/agent/runs",
  "/v1/agent/runs/:id/continue",
  "/v1/agent/runs/:id/messages",
  "/v1/crawl",
  "/v1/api-keys",
  "/v1/contexts",
  "/v1/extensions",
  "/v1/tasks",
  "/v1/tasks/:id/runs",
]);

/** Whether a POST to `route` (a path without its query) is one of IDEMPOTENT_POSTS. */
export function isIdempotentPost(route: string): boolean {
  if (IDEMPOTENT_POSTS.has(route)) return true;
  const parts = route.split("/");
  for (const pattern of IDEMPOTENT_POSTS) {
    if (!pattern.includes("/:")) continue;
    const want = pattern.split("/");
    if (want.length === parts.length && want.every((w, i) => (w.startsWith(":") ? parts[i] !== "" : w === parts[i]))) return true;
  }
  return false;
}

export const RETRY = {
  /** First backoff; it doubles per attempt up to maxDelayMs, less up to 25% jitter. */
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  /** A server asking to wait longer than this (Retry-After) is not retried: the error goes to the caller. */
  maxServerDelayMs: 60_000,
};

/**
 * How long to wait before retry number `attempt` (0 = the first retry), or null when the server asked to wait longer
 * than RETRY.maxServerDelayMs. Retry-After wins; then RateLimit-Reset, but only when that window is used up
 * (RateLimit-Remaining 0: a 429 `concurrency_limit` carries the request-rate window's headers too, and waiting for
 * that window would not free a session); then exponential backoff with jitter.
 */
export function retryDelayMs(attempt: number, error?: BoxlineError, random: () => number = Math.random): number | null {
  const server = serverDelayMs(error);
  if (server !== null) return server > RETRY.maxServerDelayMs ? null : server;
  const base = Math.min(RETRY.initialDelayMs * 2 ** attempt, RETRY.maxDelayMs);
  return Math.round(base * (1 - random() * 0.25));
}

function serverDelayMs(error?: BoxlineError): number | null {
  const headers = error?.headers;
  if (!headers) return null;
  const after = retryAfterSeconds(headers);
  if (after !== null) return after * 1000;
  const reset = headers.get("ratelimit-reset");
  if (reset !== null && headers.get("ratelimit-remaining") === "0") {
    const s = Number(reset);
    if (Number.isFinite(s) && s >= 0) return s * 1000;
  }
  return null;
}

export type Query = Record<string, string | number | boolean | string[] | null | undefined>;

/** `?a=1&b=x,y` from the defined values (arrays are comma-separated, as the API's filters expect). */
export function queryString(q: Query = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    params.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** A random UUID v4 for Idempotency-Key (Web Crypto where it exists; node:crypto on Node 18). */
export async function randomUuid(): Promise<string> {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  let bytes: Uint8Array;
  if (c?.getRandomValues) bytes = c.getRandomValues(new Uint8Array(16));
  else {
    // Kept out of static imports so browser bundles never see node:crypto.
    const mod = (await import(["node", "crypto"].join(":"))) as { randomBytes: (n: number) => Uint8Array };
    bytes = new Uint8Array(mod.randomBytes(16));
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SendInit extends RequestOptions {
  /** JSON body. */
  body?: unknown;
  /** Raw body (file uploads); sent as is. */
  rawBody?: BodyInit;
  /** "json" (default): parsed JSON; "bytes": Uint8Array; "response": the Response, body unread (streams). */
  as?: "json" | "bytes" | "response";
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * One API call with the SDK's reliability rules:
 * - retries (maxRetries, default 2) with exponential backoff and jitter after network errors, timeouts, 429 and
 *   5xx, honouring Retry-After and RateLimit-Reset; only for GETs and for the POSTs that carry an Idempotency-Key
 *   (the SDK makes one per call for those, so a retry never creates a second session, run or crawl);
 * - a time limit per attempt (timeoutMs);
 * - typed errors with the server's request id.
 */
export async function send(cfg: CoreConfig, method: string, path: string, init: SendInit = {}): Promise<{ response: Response; data: unknown }> {
  const route = path.split("?")[0]!;
  const idempotent = method === "POST" && isIdempotentPost(route);
  const idempotencyKey = init.idempotencyKey ?? (idempotent ? await randomUuid() : undefined);
  const headers: Record<string, string> = {
    accept: "application/json",
    "boxline-sdk": `node/${VERSION}`,
    ...cfg.headers,
  };
  if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
  if (init.clientRequestId) headers["x-client-request-id"] = init.clientRequestId;
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let payload: BodyInit | undefined = init.rawBody;
  if (init.body !== undefined && payload === undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(init.body);
  }
  Object.assign(headers, init.headers);

  const retryable = method === "GET" || method === "HEAD" || (idempotent && Boolean(idempotencyKey));
  const maxRetries = retryable ? Math.max(0, init.maxRetries ?? cfg.maxRetries) : 0;
  const timeoutMs = init.timeoutMs ?? cfg.timeoutMs;
  const as = init.as ?? "json";

  for (let attempt = 0; ; attempt++) {
    let error: BoxlineError;
    try {
      return await once(cfg, method, path, headers, payload, timeoutMs, init.signal, as, init.clientRequestId);
    } catch (err) {
      if (!(err instanceof BoxlineError)) throw err; // the caller aborted: never retried
      error = err;
    }
    if (attempt >= maxRetries || !error.retryable) throw error;
    const delay = retryDelayMs(attempt, error);
    if (delay === null) throw error;
    await sleep(delay, init.signal);
  }
}

async function once(
  cfg: CoreConfig,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: BodyInit | undefined,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  as: "json" | "bytes" | "response",
  clientRequestId?: string,
): Promise<{ response: Response; data: unknown }> {
  if (signal?.aborted) throw signal.reason;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(signal!.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const fail = (err: unknown): never => {
    if (timedOut) throw new BoxlineTimeoutError(`${method} ${path.split("?")[0]} timed out after ${timeoutMs} ms`, { cause: err, clientRequestId });
    if (signal?.aborted) throw signal.reason ?? err;
    const why = (err as { cause?: { code?: string; message?: string } })?.cause;
    throw new BoxlineConnectionError(`${method} ${path.split("?")[0]} could not reach ${cfg.baseUrl}: ${why?.code ?? why?.message ?? (err as Error)?.message ?? err}`, {
      cause: err,
      clientRequestId,
    });
  };
  let streaming = false;
  try {
    let response: Response;
    try {
      response = await cfg.fetch(cfg.baseUrl + path, { method, headers, body, credentials: cfg.credentials, signal: ctrl.signal });
    } catch (err) {
      return fail(err);
    }
    // errorFromResponse never throws: an unreadable body gives the generic message for the status.
    if (!response.ok) throw await errorFromResponse(response, method, path, clientRequestId);
    if (as === "response") {
      streaming = true; // the caller reads the body; the user's signal still stops it, the time limit no longer does
      clearTimeout(timer);
      return { response, data: undefined };
    }
    try {
      if (as === "bytes") return { response, data: new Uint8Array(await response.arrayBuffer()) };
      const text = response.status === 204 ? "" : await response.text();
      return { response, data: text ? JSON.parse(text) : undefined };
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new BoxlineError(response.status, "invalid_response", `${method} ${path.split("?")[0]} answered something that is not JSON`, {
          requestId: response.headers.get("x-request-id"),
          headers: response.headers,
        });
      }
      return fail(err);
    }
  } finally {
    clearTimeout(timer);
    if (!streaming) signal?.removeEventListener("abort", onAbort);
  }
}
