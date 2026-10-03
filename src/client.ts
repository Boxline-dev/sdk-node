import { queryString, send, type CoreConfig, type Query, type RequestOptions, type SendInit } from "./core.js";
import { BoxlineTimeoutError, ErrorCode, makeError, NotFoundError } from "./errors.js";
import { Page, PagePromise } from "./pagination.js";
import { Session } from "./session.js";
import { ndjson, sse } from "./streaming.js";
import type {
  ActionItem,
  ActionResult,
  AgentMessageSent,
  AgentModelCatalog,
  AgentRun,
  AgentRunEvent,
  AgentRunParams,
  AgentRunStarted,
  ContinueRunParams,
  ApiKeyInfo,
  BulkResult,
  ComputerAction,
  ComputerOptions,
  ComputerResult,
  Profile,
  ProfileUpdateParams,
  MoveShell,
  Credential,
  CredentialAuditEntry,
  CredentialAuditParams,
  CredentialCreateParams,
  CredentialUpdateParams,
  PasswordCredential,
  PasswordCredentialCreateParams,
  SecretCredential,
  SecretCredentialCreateParams,
  CrawlGetParams,
  CrawlJob,
  CrawlPage,
  CrawlParams,
  CreateSessionParams,
  ExecExit,
  ExecOptions,
  ExecResult,
  ExtensionInfo,
  ExtractParams,
  ExtractResult,
  FetchParams,
  FetchResult,
  FileList,
  FileRef,
  ListParams,
  LoginResponse,
  Me,
  MoveTimings,
  NewApiKey,
  NewWebhookEndpoint,
  ProjectSettings as ProjectSettingsData,
  AgentProvider,
  ModelKey,
  ModelKeyParams,
  CaptchaMode,
  WebhookCreateParams,
  WebhookDelivery,
  WebhookDeliveryListParams,
  WebhookEndpoint,
  WebhookEventType,
  WebhookEventTypeList,
  WebhookUpdateParams,
  PdfParams,
  PlanFeature,
  Pricing,
  Recording,
  RunScriptOptions,
  ScreenshotParams,
  ScriptResult,
  SearchParams,
  SearchResponse,
  SessionData,
  SessionEvent,
  SessionEventsParams,
  SessionListParams,
  SessionUrls,
  SignupResponse,
  Stats,
  Task,
  TaskCreateParams,
  TaskRun,
  TaskRunListParams,
  TaskRunParams,
  TaskRunStatus,
  TaskUpdateParams,
  TrajectoriesSetting,
  UpdateSessionParams,
  Usage,
  VisitedPage,
} from "./types.js";

export interface BoxlineOptions {
  /** Defaults to the BOXLINE_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to BOXLINE_API_URL, then https://api.boxline.dev (a local API: http://localhost:8080). */
  baseUrl?: string;
  /** Send the dashboard cookie instead of an API key (browser apps on the same site). */
  credentials?: RequestCredentials;
  /** A fetch implementation (default: the global fetch). */
  fetch?: typeof fetch;
  /** Retries after network errors, 429 and 5xx, for GETs and for POSTs with an Idempotency-Key (default 2). */
  maxRetries?: number;
  /** Time limit per request in ms (default 120 000; streams: until the response starts). */
  timeoutMs?: number;
  /** Headers sent with every request. */
  headers?: Record<string, string>;
}

declare const process: { env?: Record<string, string | undefined> } | undefined;
const env = (name: string) => (typeof process !== "undefined" ? process?.env?.[name] : undefined);

const DEFAULT_TIMEOUT_MS = 120_000;
/** Where the SDK goes without baseUrl or BOXLINE_API_URL (the same default as the CLI). */
export const DEFAULT_BASE_URL = "https://api.boxline.dev";
/** A plain-English step can wait up to 4 minutes for a person to solve a CAPTCHA (session captcha "ask"). */
const STEP_TIMEOUT_MS = 420_000;

type Raw = { data: unknown[]; next?: string | null } & Record<string, unknown>;

/**
 * Client for the Boxline API: isolated cloud sessions with a Chrome browser, a bash shell and a shared disk, plus
 * the web APIs and the AI agent. Works in Node 18+ and modern browsers (it uses the global fetch).
 *
 *   const bx = new Boxline();                    // BOXLINE_API_KEY; BOXLINE_API_URL (default https://api.boxline.dev)
 *   const s = await bx.sessions.create();
 *   const browser = await chromium.connectOverCDP(s.connectUrl!);
 */
export class Boxline {
  readonly baseUrl: string;
  readonly auth: Auth;
  readonly project: ProjectSettings;
  readonly apiKeys: ApiKeys;
  readonly sessions: Sessions;
  readonly profiles: Profiles;
  readonly crawl: Crawl;
  readonly agent: Agent;
  readonly tasks: Tasks;
  readonly credentials: Credentials;
  readonly webhooks: Webhooks;
  readonly extensions: Extensions;
  /** @internal */
  declare readonly cfg: CoreConfig;
  private declare readonly options: BoxlineOptions;

  constructor(opts: BoxlineOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? env("BOXLINE_API_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const cfg: CoreConfig = {
      apiKey: opts.apiKey ?? env("BOXLINE_API_KEY"),
      baseUrl: this.baseUrl,
      credentials: opts.credentials,
      // Looked up per call, so a fetch patched after the client was made (tests, tracing) is used.
      fetch: opts.fetch ?? (((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init)) as typeof fetch),
      maxRetries: opts.maxRetries ?? 2,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      headers: { ...opts.headers },
    };
    // Both hold the API key: not enumerable, so console.log(bx) and JSON.stringify(bx) never show it.
    Object.defineProperty(this, "cfg", { value: cfg, enumerable: false });
    Object.defineProperty(this, "options", { value: opts, enumerable: false });
    this.auth = new Auth(this);
    this.project = new ProjectSettings(this);
    this.apiKeys = new ApiKeys(this);
    this.sessions = new Sessions(this);
    this.profiles = new Profiles(this);
    this.crawl = new Crawl(this);
    this.agent = new Agent(this);
    this.tasks = new Tasks(this);
    this.credentials = new Credentials(this);
    this.webhooks = new Webhooks(this);
    this.extensions = new Extensions(this);
  }

  /** What JSON.stringify shows: where the client points, never its key. */
  toJSON() {
    return { baseUrl: this.baseUrl, maxRetries: this.cfg.maxRetries, timeoutMs: this.cfg.timeoutMs };
  }

  /** A client like this one with some options changed, e.g. `bx.withOptions({ maxRetries: 5 })`. */
  withOptions(opts: BoxlineOptions): Boxline {
    return new Boxline({ ...this.options, baseUrl: this.baseUrl, apiKey: this.cfg.apiKey, ...opts });
  }

  /** The calling user/project, its plan's limits and features, and whether it is suspended. */
  me(options?: RequestOptions): Promise<Me> {
    return this.request<Me>("GET", "/v1/auth/me", undefined, options);
  }

  /** True when the project's plan includes `feature` (calls using a missing feature fail with 402 feature_not_in_plan). */
  async hasFeature(feature: PlanFeature, options?: RequestOptions) {
    return Boolean((await this.me(options)).project.limits.features[feature]);
  }

  /** Fetch API: open a URL in a real browser (inside a sandbox) and get Markdown, HTML or text back. */
  fetch(url: string, params: FetchParams = {}, options?: RequestOptions): Promise<FetchResult> {
    return this.request<FetchResult>("POST", "/v1/fetch", { url, ...params }, options);
  }

  /** A screenshot of any URL (fresh browser context each time). Returns the image bytes. */
  screenshot(url: string, params: ScreenshotParams = {}, options?: RequestOptions): Promise<Uint8Array> {
    return this.bytes("POST", "/v1/screenshot", { url, ...params }, options);
  }

  /** A PDF of any URL, printed like Chrome's "Save as PDF". Returns the PDF bytes. */
  pdf(url: string, params: PdfParams = {}, options?: RequestOptions): Promise<Uint8Array> {
    return this.bytes("POST", "/v1/pdf", { url, ...params }, options);
  }

  /**
   * Structured data from one or more pages: they are rendered in a real browser, then a model fills `schema`
   * (JSON Schema) and/or follows `prompt`. Defaults to a fast, low-cost model.
   */
  extract<T = unknown>(params: ExtractParams, options?: RequestOptions): Promise<ExtractResult<T>> {
    return this.request<ExtractResult<T>>("POST", "/v1/extract", params, options);
  }

  /**
   * Web search (the platform's provider, Brave): titles, URLs, snippets and dates. With `fetch`, the top pages are
   * also opened in a sandboxed browser and returned as Markdown (`content`). The same search within an hour is
   * answered from the cache (`cached: true`, not counted). The query text goes to the provider: keep secrets and
   * personal data out of it. 503 `search_unavailable` (SearchUnavailableError) when search is not set up.
   */
  search(params: SearchParams, options?: RequestOptions): Promise<SearchResponse> {
    return this.request<SearchResponse>("POST", "/v1/search", params, options);
  }

  /** Usage and cost of the sessions created in a period (default: this month so far). */
  usage(params: { from?: string; to?: string } = {}, options?: RequestOptions): Promise<Usage> {
    return this.request<Usage>("GET", `/v1/usage${queryString(params)}`, undefined, options);
  }

  /** Totals and per-day numbers for the last `days` days (UTC, including today). */
  stats(days = 7, options?: RequestOptions): Promise<Stats> {
    return this.request<Stats>("GET", `/v1/stats${queryString({ days })}`, undefined, options);
  }

  /** The public price table and plans (no API key needed). */
  pricing(options?: RequestOptions): Promise<Pricing> {
    return this.request<Pricing>("GET", "/v1/pricing", undefined, options);
  }

  /** The OpenAPI 3.1 description of the API. */
  openapi(options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/v1/openapi.json", undefined, options);
  }

  /** `{ok: true}` when the API is up. */
  health(options?: RequestOptions): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("GET", "/healthz", undefined, options);
  }

  /** Low-level request: parsed JSON (undefined for 204). The SDK's retry and error rules apply. */
  async request<T>(method: string, path: string, body?: unknown, options: RequestOptions & Omit<SendInit, "as" | "body"> = {}): Promise<T> {
    return (await send(this.cfg, method, path, { ...options, body })).data as T;
  }

  /** Low-level request returning the Response with its body unread (after checking for errors). */
  async send(method: string, path: string, body?: unknown, options: RequestOptions & Omit<SendInit, "as" | "body"> = {}): Promise<Response> {
    return (await send(this.cfg, method, path, { ...options, body, as: "response" })).response;
  }

  /** @internal */
  async bytes(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<Uint8Array> {
    return (await send(this.cfg, method, path, { ...options, body, as: "bytes" })).data as Uint8Array;
  }

  /** @internal A list whose pages follow `next`; `map` turns each raw item into what the list yields. */
  list<T, E extends object = object>(path: string, query: Query, map: (raw: any) => T, options?: RequestOptions): PagePromise<T, Page<T> & E> {
    const load = async (after?: string): Promise<Page<T> & E> => {
      const body = await this.request<Raw>("GET", `${path}${queryString({ ...query, after: after ?? (query.after as string | undefined) })}`, undefined, options);
      return new Page<T>({ ...body, data: (body.data ?? []).map(map) }, (next) => load(next)) as Page<T> & E;
    };
    return new PagePromise<T, Page<T> & E>(() => load());
  }
}

/** The larger of the client's time limit and what a call needs (a long command, a long wait). */
const atLeast = (client: Boxline, options: RequestOptions | undefined, ms: number): RequestOptions => ({
  ...options,
  timeoutMs: options?.timeoutMs ?? Math.max(client.cfg.timeoutMs, ms),
});

const sid = (id: string) => `/v1/sessions/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------- auth, project, API keys

/** Sign-up and console logins. Server-side code uses an API key instead of logging in. */
export class Auth {
  constructor(private readonly client: Boxline) {}
  /**
   * Creates a user, a project on the Free plan and a first API key (in the response only). No API key needed.
   * `acceptTerms: true` says the user accepts the terms of service and acceptable use policy (400
   * `terms_not_accepted` without it); `name` is optional.
   */
  signup(params: { email: string; password: string; acceptTerms: true; name?: string }, options?: RequestOptions): Promise<SignupResponse> {
    return this.client.request<SignupResponse>("POST", "/v1/auth/signup", params, options);
  }
  /** Starts a console login (cookie `bx_session`): for browser apps with `credentials: "include"`. */
  login(params: { email: string; password: string }, options?: RequestOptions): Promise<LoginResponse> {
    return this.client.request<LoginResponse>("POST", "/v1/auth/login", params, options);
  }
  /** Ends the console login. */
  logout(options?: RequestOptions): Promise<void> {
    return this.client.request<void>("POST", "/v1/auth/logout", undefined, options);
  }
}

/** Project settings. */
export class ProjectSettings {
  constructor(private readonly client: Boxline) {}
  /** The Trajectories program setting: on by default; see the Terms of Service and Privacy Policy. */
  trajectories(options?: RequestOptions): Promise<TrajectoriesSetting> {
    return this.client.request<TrajectoriesSetting>("GET", "/v1/project/trajectories", undefined, options);
  }
  /** Turns the Trajectories program on or off for this project (logged). */
  setTrajectories(enabled: boolean, opts: { source?: "notice" | "settings" } = {}, options?: RequestOptions): Promise<TrajectoriesSetting> {
    return this.client.request<TrajectoriesSetting>("PUT", "/v1/project/trajectories", { enabled, ...opts }, options);
  }
  /**
   * The project's settings: `captchaDefault` is what new sessions and agent runs without a `captcha` option get;
   * `captchaDefaultEffective` what they get now (the plan may no longer include solving).
   */
  settings(options?: RequestOptions): Promise<ProjectSettingsData> {
    return this.client.request<ProjectSettingsData>("GET", "/v1/project/settings", undefined, options);
  }
  /**
   * Changes the fields you send (`captchaDefault: "solve"` needs a plan with CAPTCHA solving: 402 otherwise).
   * `defaultModel` is the model used when a request names none; `null` clears it.
   */
  setSettings(params: { captchaDefault?: CaptchaMode; defaultModel?: { provider: AgentProvider; model?: string } | null }, options?: RequestOptions): Promise<ProjectSettingsData> {
    return this.client.request<ProjectSettingsData>("PUT", "/v1/project/settings", params, options);
  }
  /** The four providers with the project's own-key state (never a key: `preview` is its last 4 characters). */
  modelKeys(options?: RequestOptions): Promise<{ keys: ModelKey[] }> {
    return this.client.request<{ keys: ModelKey[] }>("GET", "/v1/project/model-keys", undefined, options);
  }
  /**
   * Saves a provider key and/or the choice of whose key calls use. The provider checks the key first (400
   * `invalid_model_key` when it refuses it). Runs on your own key have no model charge from Boxline.
   */
  setModelKey(provider: AgentProvider, params: ModelKeyParams, options?: RequestOptions): Promise<ModelKey> {
    return this.client.request<ModelKey>("PUT", `/v1/project/model-keys/${provider}`, params, options);
  }
  /** Deletes the provider's key; calls go back to the platform's key where the plan includes it. */
  deleteModelKey(provider: AgentProvider, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", `/v1/project/model-keys/${provider}`, undefined, options);
  }
}

/** The project's API keys. */
export class ApiKeys {
  constructor(private readonly client: Boxline) {}
  /** Active keys, oldest first (the keys themselves are never shown again; `prefix` identifies them). */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<ApiKeyInfo> {
    return this.client.list<ApiKeyInfo>("/v1/api-keys", { ...params }, (k) => k, options);
  }
  /** A new key; `key` is in this response only. */
  create(params: { name?: string } = {}, options?: RequestOptions): Promise<NewApiKey> {
    return this.client.request<NewApiKey>("POST", "/v1/api-keys", params, options);
  }
  revoke(id: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", `/v1/api-keys/${encodeURIComponent(id)}`, undefined, options);
  }
}

// ---------------------------------------------------------------- sessions

export type SessionPage = Page<Session> & { total: number; limit: number; offset: number };

export class Sessions {
  readonly files: SessionFiles;
  constructor(private readonly client: Boxline) {
    this.files = new SessionFiles(client);
  }

  private wrap = (data: SessionData) => new Session(this.client, data);
  private async one(method: string, path: string, body?: unknown, options?: RequestOptions) {
    return this.wrap(await this.client.request<SessionData>(method, path, body, options));
  }

  /** Starts a session (an Idempotency-Key is sent, so a retry never starts a second one). */
  create(params: CreateSessionParams = {}, options?: RequestOptions): Promise<Session> {
    return this.one("POST", "/v1/sessions", params, options);
  }
  get(id: string, options?: RequestOptions): Promise<Session> {
    return this.one("GET", sid(id), undefined, options);
  }
  /**
   * Sessions, newest first unless `sort` says otherwise. Await it for one page (`total` counts every match), or
   * `for await (const s of bx.sessions.list())` for all of them.
   */
  list(params: SessionListParams = {}, options?: RequestOptions): PagePromise<Session, SessionPage> {
    return this.client.list<Session, { total: number; limit: number; offset: number }>("/v1/sessions", { ...params }, this.wrap, options);
  }
  /** @deprecated Use list(): its first page has `total` too. */
  page(params: SessionListParams = {}, options?: RequestOptions): Promise<SessionPage> {
    return this.list(params, options).then((p) => p);
  }
  /** Pause, resume or release 1 to 100 sessions at once (session ids; 30 calls per minute per project). */
  bulk(action: "release" | "pause" | "resume", ids: string[], options?: RequestOptions): Promise<BulkResult> {
    return this.client.request<BulkResult>("POST", "/v1/sessions/bulk", { action, ids }, options);
  }
  /** Changes keepAlive, userMetadata, the proxy, the captcha option or the browser settings. */
  update(id: string, patch: UpdateSessionParams, options?: RequestOptions): Promise<Session> {
    return this.one("PATCH", sid(id), patch, options);
  }
  /** Ends the session and deletes its machine. */
  release(id: string, options?: RequestOptions): Promise<Session> {
    return this.one("POST", `${sid(id)}/release`, undefined, options);
  }
  /** Saves browser state and files, frees the machine and stops billing. Touching the session resumes it. */
  pause(id: string, options?: RequestOptions): Promise<Session> {
    return this.one("POST", `${sid(id)}/pause`, undefined, options);
  }
  resume(id: string, options?: RequestOptions): Promise<Session> {
    return this.one("POST", `${sid(id)}/resume`, undefined, options);
  }
  /** Moves the live session to a fresh machine; clients reconnect to the same connectUrl. */
  async move(id: string, options?: RequestOptions): Promise<{ session: Session; timings: MoveTimings; shell: MoveShell | null }> {
    const r = await this.client.request<{ session: SessionData; timings: MoveTimings; shell?: MoveShell | null }>("POST", `${sid(id)}/move`, undefined, options);
    return { session: this.wrap(r.session), timings: r.timings, shell: r.shell ?? null };
  }
  /** Adds time (60–3600 s), up to the plan's maximum session length. */
  extend(id: string, seconds: number, options?: RequestOptions): Promise<Session> {
    return this.one("POST", `${sid(id)}/extend`, { seconds }, options);
  }
  /** A new IP for the session's proxy. */
  rotateProxy(id: string, options?: RequestOptions): Promise<Session> {
    return this.one("POST", `${sid(id)}/proxy/rotate`, undefined, options);
  }
  /** Revokes the session's connect, live and terminal URLs and returns the session with fresh ones. */
  rotateUrls(id: string, options?: RequestOptions): Promise<Session> {
    return this.one("POST", `${sid(id)}/rotate-urls`, undefined, options);
  }
  /** Fresh signed URLs (treat them like passwords). */
  live(id: string, options?: RequestOptions): Promise<SessionUrls> {
    return this.client.request<SessionUrls>("GET", `${sid(id)}/live`, undefined, options);
  }

  /**
   * Runs browser actions in order, next to the browser; stops at the first failure. A bare string is a plain-English
   * step: `["click Sign in", {action: "fill", selector: "#q", value: "x"}]`. Each result's `text` says what happened.
   */
  async actions(id: string, actions: ActionItem[] | ActionItem, opts: { timeoutMs?: number } = {}, options?: RequestOptions): Promise<ActionResult[]> {
    const list = Array.isArray(actions) ? actions : [actions];
    const wait = list.some((a) => typeof a === "string" || a.action === "step") ? STEP_TIMEOUT_MS : 0;
    const r = await this.client.request<{ results: ActionResult[] }>("POST", `${sid(id)}/actions`, { actions: list, ...opts }, atLeast(this.client, options, wait));
    return r.results;
  }

  /**
   * Runs ONE computer-use action exactly as the model's tool gave it (Anthropic `computer` tool input, or one OpenAI
   * `computer_call` action) on the session's page, and returns the screen after it. With `maxWidth` the screenshot is
   * scaled down and the action's coordinates are read in its pixels. A failure in the page is `ok: false`; input that
   * cannot be mapped, or a point off the screen, throws (400 `invalid_request` / `out_of_viewport`).
   */
  computer(id: string, action: ComputerAction, opts: ComputerOptions = {}, options?: RequestOptions): Promise<ComputerResult> {
    return this.client.request<ComputerResult>("POST", `${sid(id)}/computer`, { ...action, ...opts }, options);
  }

  /** Runs a shell command (persistent bash by default: cd/export survive between calls). */
  /**
   * Runs a command and returns its output. It is read as a stream (headers at once, the API keeps the connection
   * alive), so neither a long command nor a wait for the session's setup runs into an HTTP client's own limits
   * (Node's fetch gives up after 300 s without headers or data). Output past 64 KB is cut in the middle, as
   * `truncated` says.
   */
  async exec(id: string, command: string, opts: ExecOptions = {}, options?: RequestOptions): Promise<ExecResult> {
    const out = { stdout: new Capture(), stderr: new Capture() };
    // An API from before streamed exec sent headers early answers only once setup and the command are done.
    const limit = atLeast(this.client, options, (opts.timeoutMs ?? 120_000) + 30_000 + 600_000);
    const exit = await this.execStream(id, command, (stream, data) => out[stream].push(data), opts, limit);
    return { stdout: out.stdout.text, stderr: out.stderr.text, ...exit, truncated: exit.truncated || out.stdout.truncated || out.stderr.truncated };
  }
  /** Runs a command and streams its output as it happens; resolves with the exit information. */
  async execStream(id: string, command: string, onData: (stream: "stdout" | "stderr", data: string) => void, opts: ExecOptions & { signal?: AbortSignal } = {}, options?: RequestOptions): Promise<ExecExit> {
    const { signal, ...rest } = opts;
    const res = await this.client.send("POST", `${sid(id)}/exec`, { command, ...rest, stream: true }, { signal, ...options });
    let exit: ExecExit | null = null;
    for await (const msg of ndjson<{ type: string; data?: string; status?: number; code?: string; message?: string; requestId?: string } & Partial<ExecExit>>(res.body!)) {
      if (msg.type === "exit") exit = { exitCode: msg.exitCode ?? null, timedOut: Boolean(msg.timedOut), durationMs: msg.durationMs ?? 0, truncated: Boolean(msg.truncated) };
      else if (msg.type === "stdout" || msg.type === "stderr") onData(msg.type, msg.data ?? "");
      else if (msg.type === "error") throw makeError(msg.status ?? 500, msg.code ?? "internal", msg.message ?? "the command failed", { requestId: msg.requestId ?? null });
      // "waiting" (for the session's setup) and "ping" lines only keep the connection open.
    }
    return exit ?? { exitCode: null, timedOut: false, durationMs: 0, truncated: false };
  }
  /**
   * Runs Playwright code inside the session's own sandbox (needs a shell), streaming its output to `onData`. In
   * scope: `page`, `context`, `browser`, `env`, and `step()`, `extract()`, `useModel(model)` / `useModel(provider,
   * model)`. A step or extract uses the call's own `{provider, model}`, else the last `useModel()`, else `ai`.
   */
  async runScript(id: string, code: string, opts: RunScriptOptions = {}, options?: RequestOptions): Promise<ScriptResult> {
    const { signal, onData: _onData, ...body } = opts;
    const res = await this.client.send("POST", `${sid(id)}/scripts/run`, { code, ...body }, { signal, ...options });
    let stdout = "";
    let stderr = "";
    let exit = { exitCode: null as number | null, timedOut: false, durationMs: 0 };
    for await (const msg of ndjson<{ type: string; data?: string; exitCode?: number | null; timedOut?: boolean; durationMs?: number }>(res.body!)) {
      if (msg.type === "exit") exit = { exitCode: msg.exitCode ?? null, timedOut: Boolean(msg.timedOut), durationMs: msg.durationMs ?? 0 };
      else if (msg.type === "stdout" || msg.type === "stderr") {
        if (msg.type === "stdout") stdout += msg.data ?? "";
        else stderr += msg.data ?? "";
        opts.onData?.(msg.type, msg.data ?? "");
      }
    }
    return { stdout, stderr, ...exit };
  }
  /** Restarts the persistent shell (or the named one). */
  restartShell(id: string, name?: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("POST", `${sid(id)}/shell/restart`, name === undefined ? {} : { shell: name }, options);
  }
  /** Writes the browser's cookies as a Netscape cookie file in the workspace (for curl -b / wget). */
  exportCookies(id: string, path?: string, options?: RequestOptions): Promise<{ path: string; count: number }> {
    return this.client.request<{ path: string; count: number }>("POST", `${sid(id)}/browser/cookies/export`, path === undefined ? {} : { path }, options);
  }

  /** Console, network, navigation, error, lifecycle, action, exec and captcha events, oldest first. */
  events(id: string, params: SessionEventsParams = {}, options?: RequestOptions): PagePromise<SessionEvent, Page<SessionEvent> & { nextAfter: number }> {
    const { types, after, limit } = params;
    return this.client.list<SessionEvent, { nextAfter: number }>(`${sid(id)}/events`, { types, after: after === undefined ? undefined : String(after), limit }, (e) => e, options);
  }
  /** Events as they happen: first the backlog after `after`, then live. Stop with `break` or `options.signal`. */
  async *streamEvents(id: string, params: { after?: number } = {}, options?: RequestOptions): AsyncGenerator<SessionEvent> {
    const res = await this.client.send("GET", `${sid(id)}/events/stream${queryString(params)}`, undefined, options);
    yield* sse<SessionEvent>(res.body!);
  }
  /** Pages visited, grouped by tab and URL, in the order they were first visited. */
  pages(id: string, params: ListParams = {}, options?: RequestOptions): PagePromise<VisitedPage> {
    return this.client.list<VisitedPage>(`${sid(id)}/pages`, { ...params }, (p) => p, options);
  }
  /** Replay frames kept while the session ran. */
  recording(id: string, options?: RequestOptions): Promise<Recording> {
    return this.client.request<Recording>("GET", `${sid(id)}/recording`, undefined, options);
  }
  /** One replay frame as JPEG bytes. */
  recordingFrame(id: string, index: number, options?: RequestOptions): Promise<Uint8Array> {
    return this.client.bytes("GET", `${sid(id)}/recording/frames/${index}`, undefined, options);
  }
}

/** Files in a session's /workspace (shared by the shell and the browser's downloads folder). */
/** Output kept like the machine keeps it for a plain exec: the first 64 KB and the last 448 KB, the middle marked. */
class Capture {
  private head = "";
  private tail = "";
  private total = 0;
  truncated = false;
  push(chunk: string) {
    this.total += chunk.length;
    const take = Math.max(0, Math.min(64 * 1024 - this.head.length, chunk.length));
    this.head += chunk.slice(0, take);
    this.tail += chunk.slice(take);
    if (this.tail.length > 2 * 448 * 1024) this.trim();
  }
  private trim() {
    if (this.tail.length <= 448 * 1024) return;
    this.tail = this.tail.slice(-448 * 1024);
    this.truncated = true;
  }
  get text() {
    this.trim();
    return this.truncated ? `${this.head}\n[… ${this.total - this.head.length - this.tail.length} characters not shown …]\n${this.tail}` : this.head + this.tail;
  }
}

export class SessionFiles {
  constructor(private readonly client: Boxline) {}
  private url(id: string, q: Query, suffix = "") {
    return `${sid(id)}/files${suffix}${queryString(q)}`;
  }
  list(id: string, path = ".", options?: RequestOptions): Promise<FileList> {
    return this.client.request<FileList>("GET", this.url(id, { path, list: "1" }), undefined, options);
  }
  /** A file's bytes. */
  read(id: string, path: string, options?: RequestOptions): Promise<Uint8Array> {
    return this.client.bytes("GET", this.url(id, { path }), undefined, options);
  }
  async readText(id: string, path: string, options?: RequestOptions): Promise<string> {
    return new TextDecoder().decode(await this.read(id, path, options));
  }
  /** Writes a file (folders are made as needed). */
  write(id: string, path: string, data: string | Uint8Array | Blob, options?: RequestOptions): Promise<FileRef> {
    return this.client.request<FileRef>("PUT", this.url(id, { path }), undefined, {
      ...options,
      rawBody: data as BodyInit,
      headers: { "content-type": "application/octet-stream", ...options?.headers },
    });
  }
  delete(id: string, path: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", this.url(id, { path }), undefined, options);
  }
  /** Waits for a file matching a glob (e.g. `downloads/*.csv`) that has finished writing. */
  waitFor(id: string, pattern: string, timeoutMs = 30_000, options?: RequestOptions): Promise<FileRef> {
    return this.client.request<FileRef>("GET", this.url(id, { pattern, timeoutMs }, "/wait"), undefined, atLeast(this.client, options, timeoutMs + 30_000));
  }
}

// ---------------------------------------------------------------- profiles

/** Browser profiles: cookies and local storage to start sessions with (`profile: {id, persist: true}` fills one). */
export class Profiles {
  constructor(private readonly client: Boxline) {}
  /**
   * A new profile: empty, or with `fromSession` holding that working session's current cookies and site storage
   * (sign in there first, e.g. in its live view). `attach: true` also makes the session save to it from now on (at its
   * checkpoints and when it ends); a session that already has a profile refuses that (409 `conflict`). 413
   * `profile_too_large` over 16 MB; PlanLimitError (402) past the plan's `maxProfiles` or `maxProfileBytes`.
   */
  create(params: { name?: string; fromSession?: string; attach?: boolean } = {}, options?: RequestOptions): Promise<Profile> {
    return this.client.request<Profile>("POST", "/v1/profiles", params, options);
  }
  get(id: string, options?: RequestOptions): Promise<Profile> {
    return this.client.request<Profile>("GET", `/v1/profiles/${encodeURIComponent(id)}`, undefined, options);
  }
  /** Newest first; the first page's `total` counts them all. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Profile, Page<Profile> & { total: number }> {
    return this.client.list<Profile, { total: number }>("/v1/profiles", { ...params }, (c) => c, options);
  }
  /**
   * Changes the name and/or the password credential the profile signs in with: `credential: "SHOP"` links a password
   * credential (see `credentials`), so sessions with this profile, and agent runs, task runs and steps in them, get it
   * as if it were listed in their `credentials` and the AI can sign in again when the cookies have expired; `null`
   * unlinks it. NotFoundError (404 `credential_not_found`) for a name the project does not have, a 400 BoxlineError
   * for a secret (only passwords sign in), FeatureNotInPlanError (402) without the plan's `loginDetails`.
   */
  update(id: string, changes: ProfileUpdateParams, options?: RequestOptions): Promise<Profile> {
    return this.client.request<Profile>("PATCH", `/v1/profiles/${encodeURIComponent(id)}`, changes, options);
  }
  delete(id: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", `/v1/profiles/${encodeURIComponent(id)}`, undefined, options);
  }
}

// ---------------------------------------------------------------- credentials

const credentialPath = (name: string) => `/v1/credentials/${encodeURIComponent(name)}`;

/**
 * Credentials: write-only website passwords (with an optional 2FA key) and secrets. The AI uses them as placeholders
 * (`%NAME%`, `%SHOP.password%`) with `credentials` on agent runs, steps, scripts, tasks and `Session.typeCredential`;
 * shells get them as environment variables (`credentials` on sessions.create and exec), depending on each
 * credential's `scope`. A value is never returned, logged or shown; every change and use is audited.
 */
export class Credentials {
  constructor(private readonly client: Boxline) {}
  /** The project's credentials, in name order, without their values. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Credential> {
    return this.client.list<Credential>("/v1/credentials", { ...params }, (c) => c, options);
  }
  /**
   * Stores a credential, sealed; the answer never has a value. `type: "password"` takes `origins`, `username`,
   * `password` and optionally `totpSecret` (needs the plan's `loginDetails`: FeatureNotInPlanError); `type: "secret"`
   * takes `value`. CredentialExistsError for a name the project has (change it with update), PlanLimitError beyond the
   * plan's `maxCredentials`. Not retried by the SDK (the API takes no Idempotency-Key here): a retry after a lost
   * answer may meet CredentialExistsError.
   */
  create(params: PasswordCredentialCreateParams, options?: RequestOptions): Promise<PasswordCredential>;
  create(params: SecretCredentialCreateParams, options?: RequestOptions): Promise<SecretCredential>;
  create(params: CredentialCreateParams, options?: RequestOptions): Promise<Credential>;
  create(params: CredentialCreateParams, options?: RequestOptions): Promise<Credential> {
    return this.client.request<Credential>("POST", "/v1/credentials", params, options);
  }
  get(name: string, options?: RequestOptions): Promise<Credential> {
    return this.client.request<Credential>("GET", credentialPath(name), undefined, options);
  }
  /**
   * Changes the fields you send (the type cannot change: delete it and create it again). A new site, or a `scope`
   * or `shell` that makes an AI-only credential readable by shells, needs the sensitive values again in the same call
   * (a secret's `value`; a password's `password`, and `totpSecret` when it has 2FA), else a 400 `invalid_request`; a
   * 409 `conflict` when the sites, scope or `shell` changed meanwhile (send it again). A running
   * agent run keeps the values it started with; a session that exports the credential gets the new ones on its next
   * machine (move, resume, recovery).
   */
  update(name: string, patch: CredentialUpdateParams, options?: RequestOptions): Promise<Credential> {
    return this.client.request<Credential>("PATCH", credentialPath(name), patch, options);
  }
  /** Deletes it; profiles that link it are unlinked, and sessions that exported it no longer get it on their next machine. */
  delete(name: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", credentialPath(name), undefined, options);
  }
  /** Changes to credentials and each use (once per session, command, run, script, task run, typed field or 2FA code), newest first. */
  audit(params: CredentialAuditParams = {}, options?: RequestOptions): PagePromise<CredentialAuditEntry> {
    return this.client.list<CredentialAuditEntry>("/v1/credentials/audit", { ...params }, (e) => e, options);
  }
}

// ---------------------------------------------------------------- crawl

/** Crawls: follow links from a start URL in the background (robots.txt respected); poll with get() or wait(). */
export class Crawl {
  constructor(private readonly client: Boxline) {}
  start(params: CrawlParams, options?: RequestOptions): Promise<CrawlJob> {
    return this.client.request<CrawlJob>("POST", "/v1/crawl", params, options);
  }
  /** The job and one page of its pages (`limit: 0` for the job only); `next` is the cursor of the following pages. */
  get(id: string, params: CrawlGetParams = {}, options?: RequestOptions): Promise<CrawlJob> {
    return this.client.request<CrawlJob>("GET", `/v1/crawl/${encodeURIComponent(id)}${queryString({ ...params })}`, undefined, options);
  }
  /** Jobs, newest first (without their pages). */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<CrawlJob> {
    return this.client.list<CrawlJob>("/v1/crawl", { ...params }, (j) => j, options);
  }
  cancel(id: string, options?: RequestOptions): Promise<CrawlJob> {
    return this.client.request<CrawlJob>("POST", `/v1/crawl/${encodeURIComponent(id)}/cancel`, undefined, options);
  }
  /** Every page crawled so far, in index order: `for await (const p of bx.crawl.pages(id))`. */
  async *pages(id: string, params: { limit?: number } = {}, options?: RequestOptions): AsyncGenerator<CrawlPage> {
    let after: string | undefined;
    do {
      const job = await this.get(id, { limit: params.limit ?? 100, after }, options);
      yield* job.data;
      after = job.next ?? undefined;
    } while (after);
  }
  /** Waits for the crawl to finish, then returns the job with every page in `data`. */
  async wait(id: string, opts: { pollMs?: number; timeoutMs?: number } = {}, options?: RequestOptions): Promise<CrawlJob> {
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
    let job = await this.get(id, { limit: 0 }, options);
    while (job.status === "running") {
      if (Date.now() > deadline) throw new BoxlineTimeoutError("the crawl did not finish in time");
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000));
      job = await this.get(id, { limit: 0 }, options);
    }
    const data: CrawlPage[] = [];
    for await (const p of this.pages(id, {}, options)) data.push(p);
    return { ...job, data, next: null };
  }
}

// ---------------------------------------------------------------- webhooks

const whid = (id: string) => `/v1/webhooks/${encodeURIComponent(id)}`;

/**
 * Webhook endpoints: signed HTTPS callbacks when something finishes or needs a person. Verify each delivery with
 * verifyWebhook(rawBody, header, secret) and drop event ids you have handled already.
 */
export class Webhooks {
  constructor(private readonly client: Boxline) {}
  /** A new endpoint (public HTTPS only); `secret` ("whsec_…") is in this response only. */
  create(params: WebhookCreateParams, options?: RequestOptions): Promise<NewWebhookEndpoint> {
    return this.client.request<NewWebhookEndpoint>("POST", "/v1/webhooks", params, options);
  }
  /** The project's endpoints, oldest first (never their secrets). */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<WebhookEndpoint> {
    return this.client.list<WebhookEndpoint>("/v1/webhooks", { ...params }, (w) => w, options);
  }
  get(id: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.client.request<WebhookEndpoint>("GET", whid(id), undefined, options);
  }
  /** Changes the URL, events, description, or switches it on or off (`enabled: true` also forgets its failures). */
  update(id: string, patch: WebhookUpdateParams, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.client.request<WebhookEndpoint>("PATCH", whid(id), patch, options);
  }
  /** Deletes the endpoint with its queue and delivery log. */
  delete(id: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", whid(id), undefined, options);
  }
  /** A new secret (in this response only); the old one keeps signing too for 24 hours (a second v1). */
  rotateSecret(id: string, options?: RequestOptions): Promise<NewWebhookEndpoint> {
    return this.client.request<NewWebhookEndpoint>("POST", `${whid(id)}/rotate-secret`, undefined, options);
  }
  /**
   * Sends a `webhook.test` event to this endpoint now, or with `type` a made-up sample of that event type (marked
   * `test: true`); one attempt, waits up to 12 s for the answer.
   */
  test(id: string, params: { type?: WebhookEventType | "webhook.test" } = {}, options?: RequestOptions): Promise<WebhookDelivery> {
    return this.client.request<WebhookDelivery>("POST", `${whid(id)}/test`, params.type ? { type: params.type } : undefined, options);
  }
  /** Every event type an endpoint can subscribe to, with its group and description (subscribe to "*" for all). */
  eventTypes(options?: RequestOptions): Promise<WebhookEventTypeList> {
    return this.client.request<WebhookEventTypeList>("GET", "/v1/webhooks/events", undefined, options);
  }
  /** The endpoint's deliveries, newest first, each with its attempt history; `status` filters them. */
  deliveries(id: string, params: WebhookDeliveryListParams = {}, options?: RequestOptions): PagePromise<WebhookDelivery> {
    return this.client.list<WebhookDelivery>(`${whid(id)}/deliveries`, { ...params }, (d) => d, options);
  }
  /**
   * Sends a finished delivery again now, with the same event id and body (409 invalid_state while it is still queued,
   * PayloadExpiredError after 7 days, WebhookDisabledError while the endpoint is switched off).
   */
  retryDelivery(id: string, deliveryId: string, options?: RequestOptions): Promise<WebhookDelivery> {
    return this.client.request<WebhookDelivery>("POST", `${whid(id)}/deliveries/${encodeURIComponent(deliveryId)}/retry`, undefined, options);
  }
}

// ---------------------------------------------------------------- tasks

const tid = (id: string) => `/v1/tasks/${encodeURIComponent(id)}`;
/** The task-run statuses of a run that has not finished (queued: a scheduled run waiting for its turn). */
const TASK_RUN_OPEN: TaskRunStatus[] = ["queued", "running", "paused"];

export interface WaitOptions {
  /** How often to look, in ms (default 1000). */
  pollMs?: number;
  /** Give up after this long, in ms (default 30 minutes): BoxlineTimeoutError. */
  timeoutMs?: number;
}

/**
 * Tasks: saved agent runs (an instruction with %name% variables, an optional output schema, browser settings, a saved
 * login and a model), run by hand or on a schedule. Every run is an agent run tagged with the task. Needs the plan's
 * `agentRuns`; the plan limits tasks and schedules switched on (PlanLimitError).
 */
export class Tasks {
  constructor(private readonly client: Boxline) {}
  /** Saves a task (an Idempotency-Key is sent, so a retry never saves it twice). */
  create(params: TaskCreateParams, options?: RequestOptions): Promise<Task> {
    return this.client.request<Task>("POST", "/v1/tasks", params, options);
  }
  /** The project's tasks, newest first. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<Task> {
    return this.client.list<Task>("/v1/tasks", { ...params }, (t) => t, options);
  }
  get(id: string, options?: RequestOptions): Promise<Task> {
    return this.client.request<Task>("GET", tid(id), undefined, options);
  }
  /**
   * Changes the fields you send; `null` removes an optional one. `schedule` fields are merged into the current schedule
   * (`{schedule: {enabled: false}}` pauses it); switching it on, or changing cron or timezone, counts from now.
   */
  update(id: string, patch: TaskUpdateParams, options?: RequestOptions): Promise<Task> {
    return this.client.request<Task>("PATCH", tid(id), patch, options);
  }
  /** Deletes the task with its run history (its agent runs stay, and runs in progress go on). */
  delete(id: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", tid(id), undefined, options);
  }
  /**
   * Runs the task now and returns its task run (status running) right away; waitForRun() waits for the result. Plain
   * values are written into the instruction; secret ones must come with every run and go in as agent variables (the
   * model sees only %name%). MissingVariablesError when a variable without a default has no value. Counts as an agent
   * run (rate, plan, spend cap). An Idempotency-Key is sent, so a retry never starts a second run. `T`: the type of the
   * result (the JSON answer when the task has an output schema).
   */
  run<T = unknown>(id: string, params: TaskRunParams = {}, options?: RequestOptions): Promise<TaskRun<T>> {
    return this.client.request<TaskRun<T>>("POST", `${tid(id)}/runs`, params, options);
  }
  /** The task's runs, newest first: by hand, on the schedule, and skipped or missed times (kept 30 days); `status` filters. */
  runs<T = unknown>(id: string, params: TaskRunListParams = {}, options?: RequestOptions): PagePromise<TaskRun<T>> {
    return this.client.list<TaskRun<T>>(`${tid(id)}/runs`, { ...params }, (r) => r, options);
  }
  /**
   * Polls until the task run has finished (completed, failed or canceled; a paused run keeps waiting for a person, a
   * queued one for its turn) and returns it with its result. Pass the run that run() returned, or the task's and the
   * run's ids. NotFoundError when the run is not in the task's history.
   *
   *   const run = await bx.tasks.run<{ books: Book[] }>(task.id, { variables: { category: "Poetry" } });
   *   const done = await bx.tasks.waitForRun(run);   // done.result: { books: Book[] } | null
   */
  waitForRun<T = unknown>(run: TaskRun<T> | { taskId: string; id: string }, opts?: WaitOptions, options?: RequestOptions): Promise<TaskRun<T>>;
  waitForRun<T = unknown>(taskId: string, taskRunId: string, opts?: WaitOptions, options?: RequestOptions): Promise<TaskRun<T>>;
  async waitForRun<T = unknown>(
    first: string | TaskRun<T> | { taskId: string; id: string },
    second?: string | WaitOptions,
    third?: WaitOptions | RequestOptions,
    fourth?: RequestOptions,
  ): Promise<TaskRun<T>> {
    const byIds = typeof first === "string";
    const taskId = byIds ? first : first.taskId;
    const runId = byIds ? (second as string) : first.id;
    const opts = ((byIds ? third : second) ?? {}) as WaitOptions;
    const options = (byIds ? fourth : third) as RequestOptions | undefined;
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
    for (;;) {
      // There is no GET for one task run: the unfinished ones are a short list, and a run missing from it has finished.
      let open = false;
      for await (const r of this.runs<T>(taskId, { status: TASK_RUN_OPEN, limit: 100 }, options)) {
        if (r.id === runId) {
          open = true;
          break;
        }
      }
      if (!open) {
        for await (const r of this.runs<T>(taskId, { limit: 100 }, options)) if (r.id === runId) return r;
        throw new NotFoundError(404, ErrorCode.notFound, `task run ${runId} is not in the run history of task ${taskId}`);
      }
      if (Date.now() > deadline) throw new BoxlineTimeoutError("the task run did not finish in time");
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000));
    }
  }
}

// ---------------------------------------------------------------- extensions

/** A file's bytes (Node, Deno, Bun); kept out of static imports so browser bundles never see node:fs. */
async function readFileBytes(path: string): Promise<Uint8Array> {
  const fs = (await import(["node", "fs/promises"].join(":"))) as { readFile: (p: string) => Promise<Uint8Array> };
  return new Uint8Array(await fs.readFile(path));
}

/**
 * Chrome extensions (Manifest V3) to start sessions with (`extensions: [id]`; plan feature `extensions`). An extension
 * sees every page and every typed value in the sessions that use it: upload only extensions you trust.
 */
export class Extensions {
  constructor(private readonly client: Boxline) {}
  /**
   * Uploads an unpacked extension as a zip, at most 10 MB: its bytes, a Blob, or a file path (Node). It is checked
   * before it is stored (InvalidExtensionError says why; PayloadTooLargeError over 10 MB; LimitReachedError beyond 100
   * extensions). An Idempotency-Key is sent, so a retry never stores it twice.
   */
  async upload(zip: Uint8Array | ArrayBuffer | Blob | string, options?: RequestOptions): Promise<ExtensionInfo> {
    const body = typeof zip === "string" ? await readFileBytes(zip) : zip instanceof ArrayBuffer ? new Uint8Array(zip) : zip;
    return this.client.request<ExtensionInfo>("POST", "/v1/extensions", undefined, {
      ...options,
      rawBody: body as BodyInit,
      headers: { "content-type": "application/zip", ...options?.headers },
    });
  }
  /** The project's extensions, newest first. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<ExtensionInfo> {
    return this.client.list<ExtensionInfo>("/v1/extensions", { ...params }, (e) => e, options);
  }
  get(id: string, options?: RequestOptions): Promise<ExtensionInfo> {
    return this.client.request<ExtensionInfo>("GET", `/v1/extensions/${encodeURIComponent(id)}`, undefined, options);
  }
  /** Deletes it; sessions already running with it keep it until they move or resume. */
  delete(id: string, options?: RequestOptions): Promise<void> {
    return this.client.request<void>("DELETE", `/v1/extensions/${encodeURIComponent(id)}`, undefined, options);
  }
}

// ---------------------------------------------------------------- agent

/** Agent runs: a model (Claude or GPT) drives the session's browser and shell to finish a task. */
export class Agent {
  constructor(private readonly client: Boxline) {}
  /** Providers and models customers can choose, with prices and whether each is configured on the server. */
  models(options?: RequestOptions): Promise<AgentModelCatalog> {
    return this.client.request<AgentModelCatalog>("GET", "/v1/agent/models", undefined, options);
  }
  /**
   * Starts a run and returns right away (an Idempotency-Key is sent, so a retry never starts a second run). With
   * `output` (a JSON Schema) the answer is JSON matching it: read it with `wait<T>(id)` or `get<T>(id)`.
   */
  run(params: AgentRunParams, options?: RequestOptions): Promise<AgentRunStarted> {
    return this.client.request<AgentRunStarted>("POST", "/v1/agent/runs", params, options);
  }
  /** The run with its steps. `T`: the type of `result` (text by default; the JSON answer's type with an output schema). */
  get<T = string>(id: string, options?: RequestOptions): Promise<AgentRun<T>> {
    return this.client.request<AgentRun<T>>("GET", `/v1/agent/runs/${encodeURIComponent(id)}`, undefined, options);
  }
  /** Runs, newest first. */
  list(params: ListParams = {}, options?: RequestOptions): PagePromise<AgentRun> {
    return this.client.list<AgentRun>("/v1/agent/runs", { ...params }, (r) => r, options);
  }
  /** Take the browser from the agent (it finishes its current action, then waits). RunNotLiveError when its server stopped. */
  takeover(id: string, reason?: string, options?: RequestOptions): Promise<AgentRun> {
    return this.client.request<AgentRun>("POST", `/v1/agent/runs/${encodeURIComponent(id)}/takeover`, reason === undefined ? {} : { reason }, options);
  }
  /** Give the browser back; the agent reads `note` before it continues. RunNotLiveError when its server stopped: continueRun. */
  handBack(id: string, note?: string, options?: RequestOptions): Promise<AgentRun> {
    return this.client.request<AgentRun>("POST", `/v1/agent/runs/${encodeURIComponent(id)}/handback`, note === undefined ? {} : { note }, options);
  }
  /** Stops the run for good. */
  cancel(id: string, options?: RequestOptions): Promise<AgentRun> {
    return this.client.request<AgentRun>("POST", `/v1/agent/runs/${encodeURIComponent(id)}/cancel`, undefined, options);
  }
  /**
   * Continues a run that stopped at one of its limits (errorCode max_steps, max_cost, too_many_errors or no_progress)
   * while its `continuable` is set: a new run in the same session, with the same model, mode, output schema, credentials
   * and profile, and a compact record of what the previous run did. Returns the new run (`continuedFrom` links
   * back); wait for it with `wait(run.id)` or `stream(run.id)` like any run. A run that had `variables` needs them again
   * (MissingVariablesError otherwise). NotContinuableError: it did not stop at a limit, was continued already, or its
   * window passed. An Idempotency-Key is sent, so a retry never starts a second run.
   *
   * `const next = await bx.agent.continueRun(run.id, { maxSteps: 30, instruction: "The CSV is downloaded already" })`
   */
  continueRun<T = string>(id: string, params: ContinueRunParams = {}, options?: RequestOptions): Promise<AgentRun<T>> {
    return this.client.request<AgentRun<T>>("POST", `/v1/agent/runs/${encodeURIComponent(id)}/continue`, params, options);
  }
  /**
   * Tells a working run something (1–2000 characters) without taking the browser: the agent reads it at its next step
   * (a model call or tool under way is not interrupted), and it shows as a `message` step. A run waiting for your help
   * (ask_user_for_help) takes it as the answer and goes on. At most 50 per run; InvalidStateError-like 409
   * (a BoxlineError with code `invalid_state`) once the run has finished, TooManyMessagesError after 50.
   */
  sendMessage(id: string, text: string, options?: RequestOptions): Promise<AgentMessageSent> {
    return this.client.request<AgentMessageSent>("POST", `/v1/agent/runs/${encodeURIComponent(id)}/messages`, { text }, options);
  }
  /**
   * The run as it happens: its steps so far, then new steps, `status` changes, live shell `exec`/`output`, and a
   * final `done` event, after which the iteration ends.
   */
  async *stream<T = string>(id: string, options?: RequestOptions): AsyncGenerator<AgentRunEvent<T>> {
    const res = await this.client.send("GET", `/v1/agent/runs/${encodeURIComponent(id)}/events`, undefined, options);
    for await (const event of sse<AgentRunEvent<T>>(res.body!)) {
      yield event;
      if (event.type === "done") return;
    }
  }
  /**
   * Polls until the run finishes (a paused run keeps waiting for the user). `T` as on get():
   * `const run = await bx.agent.wait<{ books: Book[] }>(id)`.
   */
  async wait<T = string>(id: string, opts: { pollMs?: number; timeoutMs?: number } = {}, options?: RequestOptions): Promise<AgentRun<T>> {
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
    for (;;) {
      const run = await this.get<T>(id, options);
      if (run.status !== "running" && run.status !== "paused") return run;
      if (Date.now() > deadline) throw new BoxlineTimeoutError("the agent run did not finish in time");
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000));
    }
  }
}

export default Boxline;
