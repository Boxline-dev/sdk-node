/**
 * The API's objects, as in docs/openapi.yaml (and docs/CONTRACT.md). Dates are ISO 8601 strings.
 */

// ---------------------------------------------------------------- shared

export type SessionStatus = "RUNNING" | "PAUSED" | "COMPLETED" | "ERROR";
/** What happens when a CAPTCHA waits for a person: "ask" (default) pauses and hands over, "ignore" carries on, "solve" tries to solve it first. */
export type CaptchaMode = "ask" | "ignore" | "solve";
/** A CAPTCHA provider the platform recognises. */
export type CaptchaKind = "recaptcha" | "hcaptcha" | "turnstile" | "cloudflare" | "datadome" | "arkose" | "human";
export type WaitUntil = "load" | "domcontentloaded" | "networkidle" | "commit";
/** Model providers: Anthropic Claude, OpenAI, Grok (xAI) and Google Gemini. Grok and Gemini have no computer use (mode "computer"). */
export type AgentProvider = "anthropic" | "openai" | "xai" | "google";
/** Whose key a model call uses: the project's own ("project": no model charge from Boxline) or the platform's. */
export type ModelKeySource = "project" | "platform";
export interface Viewport {
  width: number;
  height: number;
}

// ---------------------------------------------------------------- accounts and plans

export interface User {
  id: string;
  email: string;
  /** The user's name (signup, login and `me`), or null. */
  name?: string | null;
}
export interface Suspension {
  at: string;
  reason: string | null;
}
export interface Project {
  id: string;
  name: string;
  plan: string;
  suspended?: Suspension | null;
}
export interface SignupResponse {
  user: User;
  project: Project;
  /** The first API key, shown only here. */
  apiKey: string;
}
export interface LoginResponse {
  user: User;
  project: Project;
}

/** What a plan may use; set per plan in the admin panel. Calls that need a missing one fail with 402 `feature_not_in_plan`. */
export type PlanFeature =
  | "shell"
  | "pauseResume"
  | "profiles"
  | "recording"
  | "realisticBrowser"
  | "residentialProxy"
  | "datacenterProxy"
  | "customProxy"
  | "captchaSolving"
  | "agentRuns"
  | "steps"
  | "extract"
  | "quickApis"
  | "crawl"
  | "extensions"
  | "webSearch"
  | "loginDetails"
  /** Model calls on Boxline's keys; without it (Free) a project runs models on its own keys only. */
  | "platformModels";

/** A plan's limits (null = no limit) and features. */
export interface Plan {
  id?: string;
  name: string;
  priceUsd: number | null;
  includedUsd: number;
  concurrency: number;
  maxTimeoutSeconds: number;
  modelSpendCapUsd: number | null;
  proxyGbPerMonth: number | null;
  /** 0 = not on this plan, null = no cap. */
  captchaSolvesPerMonth: number | null;
  /** Web searches included per calendar month (UTC); null = no limit. */
  searchesPerMonth: number | null;
  /** Price per 1,000 searches beyond searchesPerMonth; null = no searches beyond it (402 plan_limit). */
  extraSearchesPer1000Usd: number | null;
  /** Webhook endpoints a project may have; null = no limit. */
  webhookEndpoints: number | null;
  /** Days an ended session's recording, logs and agent-run steps are kept (then deleted; the session stays). */
  retentionDays: number;
  /** Tasks a project may have; null = no plan limit (1,000 per project at most). */
  tasks?: number | null;
  /** Tasks with a schedule switched on; 0 = no schedules, null = no limit. */
  schedules?: number | null;
  /** Credentials (passwords and secrets together) a project may keep. */
  maxCredentials?: number;
  /** Browser profiles a project may keep; null = no limit. */
  maxProfiles?: number | null;
  /** Bytes a project's profiles may hold together; null = no limit. */
  maxProfileBytes?: number | null;
  features: Record<PlanFeature, boolean>;
  public?: boolean;
}
/** @deprecated Use Plan. */
export type PlanLimits = Plan;

/** The project's settings (GET/PUT /v1/project/settings). */
export interface ProjectSettings {
  /** What new sessions and agent runs without a `captcha` option get (default "ask"). */
  captchaDefault: CaptchaMode;
  /** What they get now: "ask" when the setting is "solve" but the plan no longer includes solving. */
  captchaDefaultEffective: CaptchaMode;
  /** The model used when a request names no provider or model (explicit request, then this, then the server default); null: none. */
  defaultModel: { provider: AgentProvider; model: string } | null;
  updatedAt: string | null;
  /** The project's own user who changed it last in the console (null for an API key or support). */
  updatedBy: string | null;
  /** How it was changed last; null if never. */
  updatedVia: "console" | "api_key" | "support" | null;
}

/** One provider's own-key state (GET/PUT /v1/project/model-keys). The key itself is never returned. */
export interface ModelKey {
  provider: AgentProvider;
  /** The stored choice: calls use the project's own key or the platform's. */
  use: ModelKeySource;
  /** What calls use now: the plan can override the choice (Free: always "project"). */
  useEffective: ModelKeySource;
  hasKey: boolean;
  /** The last 4 characters of the key, or null. */
  preview: string | null;
  /** The provider accepted the key when it was saved (false: the provider could not be reached; the key was saved). */
  verified: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  updatedVia: "console" | "api_key" | "support" | null;
  lastUsedAt: string | null;
  /** The platform can make calls for this provider for this project (a server key exists and the plan includes it). */
  platformAvailable: boolean;
}
export interface ModelKeyParams {
  /** The provider key (20 to 400 characters). Saving one without `use` sets `use: "project"`. */
  key?: string;
  /** "project" needs a saved key; "platform" needs a plan with `platformModels` (402 otherwise). */
  use?: ModelKeySource;
}

/** A project's Trajectories program setting (see the Terms of Service and Privacy Policy). */
export interface TrajectoriesSetting {
  enabled: boolean;
  /** When the project was shown the notice; until then no session is eligible. */
  noticeSeenAt: string | null;
  /** The user who made the last choice (null for an API key). */
  decidedBy: string | null;
}

export interface Me {
  /** The logged-in user; null when calling with an API key. */
  user:
    | (User & {
        isAdmin: boolean;
        name: string | null;
        /** The latest terms of service version the user accepted (a date), or null. */
        termsVersion: string | null;
        /** Newer terms exist: the console asks the user to accept them. */
        termsUpdate: boolean;
        /** The current terms version (what accepting the terms records). */
        termsCurrentVersion?: string;
        /** The user confirmed the email (a completed password reset). */
        emailVerified?: boolean;
      })
    | null;
  /** Set when an admin is acting as this user from the admin panel. */
  impersonatedBy: User | null;
  project: Project & { suspended: Suspension | null; limits: Plan; trajectories: TrajectoriesSetting };
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  /** Identifies the key; the key itself is never shown again. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export interface NewApiKey {
  id: string;
  name: string;
  prefix: string;
  /** The key itself: shown only in this response. */
  key: string;
}

// ---------------------------------------------------------------- proxies and browser settings

/**
 * One proxy.
 * - residential / datacenter: the platform's proxies; `country` (two letters), and for residential
 *   `state` ("us_california") and `city` ("los_angeles").
 * - custom: your own proxy, `server` like "http://host:port" with optional `username` / `password`.
 * `ip`: "sticky" keeps one IP (sessions and crawls default) or "rotating" (quick APIs default).
 * `scope`: "all" also routes the session's shell (curl, pip, git…) through the proxy.
 */
export type ProxyConfig =
  | { type: "residential"; country?: string; state?: string; city?: string; ip?: "sticky" | "rotating"; scope?: "browser" | "all" }
  | { type: "datacenter"; country?: string; ip?: "sticky" | "rotating"; scope?: "browser" | "all" }
  | { type: "custom"; server: string; username?: string; password?: string; ip?: "sticky" | "rotating"; scope?: "browser" | "all" };

/**
 * One rule of a proxy list. For every connection the rules are tried in order and the first whose
 * `domainPattern` (a regular expression tested against the site's host name) matches is used; a rule without a
 * pattern matches everything. `type: "none"` goes straight out. No match: straight out.
 */
export type ProxyRule = (ProxyConfig & { domainPattern?: string }) | { type: "none"; domainPattern?: string };

/**
 * A proxy for a session or a quick-API request: `true` (a residential US proxy), one proxy, or a list of rules by
 * site (at most 10). `false` means none.
 */
export type ProxyOption = boolean | ProxyConfig | ProxyRule[];

/** A proxy as the API returns it: never with a password. */
export type PublicProxy<T = ProxyConfig | ProxyRule> = T extends { password?: string } ? Omit<T, "password"> : T;

/**
 * How the session's browser runs.
 * - `mode: "realistic"` puts its clock and language on the proxy's country, so a session leaving from Berlin
 *   also says it is in Berlin. `"standard"` (the default) leaves the browser as it is (UTC, en-US).
 * - `locale` ("de-DE") and `timezone` ("Europe/Berlin") set them yourself, and win over the mode.
 * Nothing here changes what the browser reports about itself.
 */
export interface BrowserOptions {
  mode?: "standard" | "realistic";
  locale?: string;
  timezone?: string;
}

/** What is in force (locale and timezone null = the browser's own default). */
export interface BrowserSettings {
  mode: "standard" | "realistic";
  locale: string | null;
  timezone: string | null;
}

// ---------------------------------------------------------------- sessions

/** Set on a session while a CAPTCHA waits for a person (or is being solved). */
export interface CaptchaAttention {
  type: "captcha";
  kind: CaptchaKind;
  url: string;
  tabId?: string;
  since: string;
  /** "solving": captcha "solve" is trying it automatically, nobody needs to act. "waiting": a person's turn. */
  state?: "solving" | "waiting";
  /** Why it waits for a person when automatic solving was not allowed or failed. */
  reason?: string;
}

export interface SessionData {
  id: string;
  status: SessionStatus;
  projectId: string;
  region: string;
  browser: boolean;
  shell: boolean;
  keepAlive: boolean;
  /** Seconds. */
  timeout: number;
  /** Seconds without activity after which the session ends (endReason "idle"); null: off. */
  idleTimeout?: number | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string;
  endReason: SessionEndReason | null;
  /** CDP WebSocket for Playwright/Puppeteer (null without a browser or once ended). Treat it like a password. */
  connectUrl: string | null;
  /** The live view page. Treat it like a password. */
  liveUrl: string | null;
  /** The terminal WebSocket (null without a shell). Treat it like a password. */
  terminalUrl: string | null;
  /** The session's proxy or proxy rules (never passwords), or null. */
  proxy: PublicProxy<ProxyConfig> | PublicProxy<ProxyRule>[] | null;
  /** The browser mode, and the clock and language actually in force. */
  browserSettings: BrowserSettings;
  /** The page size (fixed at start, kept across moves and resumes); null without a browser. */
  viewport: Viewport | null;
  /** Whether this session may be used for trajectory datasets (fixed when it started). */
  trajectoriesEligible: boolean;
  captcha: CaptchaMode;
  /** A CAPTCHA waiting for a person, or null. */
  attention: CaptchaAttention | null;
  workspacePath: string;
  profileId: string | null;
  /** Whether the session saves its sign-ins back to `profileId` when it ends. */
  profilePersist?: boolean;
  userMetadata: Record<string, unknown>;
  moves: number;
  /** When the last automatic checkpoint was taken (null before the first one). */
  checkpointAt: string | null;
  /** How many times the session was brought back on a new machine after its machine stopped. */
  recoveries: number;
  error: string | null;
  recordSession: boolean;
  hasRecording: boolean;
  /** When the recording, logs and agent-run steps were deleted under the plan's `retentionDays` (null until then). */
  dataDeletedAt?: string | null;
  setup: string[];
  setupStatus: "none" | "running" | "done" | "failed";
  setupError: string | null;
  /** Requests to ad and tracker sites are refused inside the machine. */
  blockAds: boolean;
  /** Requests refused so far (collected about every 30 s). */
  blockedRequests: number;
  /** "reject": consent banners are answered "Reject all" / "Necessary only", else hidden. */
  cookieBanners: CookieBanners;
  /** The extension ids the session started with. */
  extensions: string[];
  /** The names of the session's env variables (values are never returned). */
  env?: string[];
  /** The names of the credentials its shell exports (a credential its profile links is listed too when it went into the shell). */
  credentials?: string[];
  usage: { seconds: number; costUsd: number };
}

/**
 * Why a session ended. "idle": its idleTimeout passed without activity; "disconnected": a browser-only session without
 * keepAlive whose last client left, with no agent run, script or step working in it; "agent_finished": its agent run's
 * own session, released when the run ended (or when a run's continue window passed unused).
 */
export type SessionEndReason =
  | "released"
  | "timeout"
  | "idle"
  | "disconnected"
  | "agent_finished"
  | "api_restart"
  | "paused_expired"
  | "machine_lost"
  | "account_recovered"
  | (string & {});

/** "reject" (the default for new sessions): answer consent banners with "Reject all" or "Necessary only" (never accept), else hide them. */
export type CookieBanners = "reject" | "off";

export interface CreateSessionParams {
  /** `false` for a session without a browser, or options for the one it gets (see BrowserOptions). */
  browser?: boolean | BrowserOptions;
  /** A bash shell with Python, Node, ffmpeg and sudo, sharing /workspace with the browser. */
  shell?: boolean;
  /** Seconds (default 300), up to the plan's maxTimeoutSeconds. */
  timeout?: number;
  /**
   * Opt-in: the session ends (endReason "idle") after this many seconds without activity, 30 to `timeout`. Activity:
   * CDP commands, live-view input, terminal keys, exec, files, actions and steps, scripts, agent steps and messages;
   * an agent run working in it (or one that can still be continued) counts the whole time. Protects keepAlive and
   * shell sessions whose client crashed.
   */
  idleTimeout?: number | null;
  /** Keep a browser-only session after its last client disconnects. */
  keepAlive?: boolean;
  viewport?: Viewport;
  userMetadata?: Record<string, unknown>;
  /** Start from a profile; `persist: true` saves the browser's logins back into it at the end. */
  profile?: { id: string; persist?: boolean };
  /** Keep replay frames of this session (default true). */
  recordSession?: boolean;
  /**
   * Shell commands run when the session starts and again after a move or resume, e.g.
   * ["sudo apt-get install -y ffmpeg", "pip install yt-dlp"]. Needs shell: true.
   */
  setup?: string[];
  /** Send the session's traffic through a proxy (see ProxyOption). */
  proxy?: ProxyOption;
  /**
   * When a CAPTCHA waits for a person: "ask" (default) pauses agent runs and plain-English steps until someone
   * solves it in the live view; "ignore" lets them carry on; "solve" has the platform try to solve it
   * automatically and falls back to "ask" if that fails. Either way `attention` and `captcha` events report it.
   * Only enable "solve" for sites you are authorised to automate.
   */
  captcha?: CaptchaMode;
  /** Refuse requests to ad and tracker sites inside the machine (every plan; default false). */
  blockAds?: boolean;
  /** "reject" (default) answers cookie banners with "Reject all" / "Necessary only"; "off" leaves them. */
  cookieBanners?: CookieBanners;
  /**
   * Uploaded extensions (extensions.upload) to load into the browser, at most 10; set at start only. An extension sees
   * every page and every typed value in the session: use only ones you trust.
   */
  extensions?: string[];
  /**
   * Variables for the session's shell (needs shell: true): new terminals, exec, scripts and `setup` commands get them,
   * and they are set again on every new machine (move, resume, recovery). Names like the shell's
   * ([A-Za-z_][A-Za-z0-9_]*, not PATH, HOME or BOXLINE_*), at most 100, 64 KB together. Kept sealed; the session
   * shows the names only.
   */
  env?: Record<string, string | number | boolean>;
  /**
   * Credentials exported into the shell (needs shell: true; the credential needs scope "shell" or "all", or shell:
   * true, else CredentialNotAllowedError): a secret as `$NAME`, a password as `$NAME_USERNAME` and `$NAME_PASSWORD`
   * (its 2FA code comes from `boxline-otp NAME`, the key itself never enters the machine). Kept in the machine's
   * memory only and hidden in exec, script and terminal output. Anything that runs in the shell can read them: export
   * only what you accept that for.
   */
  credentials?: string[];
}

export interface UpdateSessionParams {
  keepAlive?: boolean;
  /** Seconds without activity before it ends (counted from now), 30 to its timeout; null switches it off. */
  idleTimeout?: number | null;
  userMetadata?: Record<string, unknown>;
  /** A new proxy applies at once (open connections are closed); null removes it. */
  proxy?: ProxyOption | null;
  captcha?: CaptchaMode;
  browser?: BrowserOptions;
  /** Applies at once; turning it on also closes open connections to listed sites. */
  blockAds?: boolean;
  /** Applies at once: "reject" also answers banners already open. */
  cookieBanners?: CookieBanners;
}

export interface SessionListParams {
  /** One status or several, e.g. ["RUNNING", "PAUSED"]. */
  status?: SessionStatus | SessionStatus[];
  /** "browser" (no shell), "combined" (browser and shell) or "shell" (no browser). */
  kind?: "browser" | "combined" | "shell";
  /** A session id prefix, or text inside userMetadata. */
  q?: string;
  /** Created at or after (ISO date). */
  from?: string;
  /** Created at or before (ISO date). */
  to?: string;
  sort?: "created_desc" | "created_asc" | "duration_desc";
  /** Per page: 1–500, default 50. */
  limit?: number;
  /** The `next` of the previous page. */
  after?: string;
  /** @deprecated Use `after` (cursor pages). */
  offset?: number;
}
/** @deprecated Use SessionListParams. */
export type SessionListFilters = SessionListParams;

export interface ListParams {
  limit?: number;
  /** The `next` of the previous page. */
  after?: string;
}

export interface SessionUrls {
  liveUrl: string | null;
  terminalUrl: string | null;
  connectUrl: string | null;
}

export interface MoveTimings {
  captureMs: number;
  acquireMs: number;
  restoreMs: number;
  totalMs: number;
}

/**
 * Sessions with a shell, after a move: where the shell continues and which exported variables came along (the
 * session's env and credentials are set again as well). Running processes do not move; the ones that were stopped are listed.
 */
export interface MoveShell {
  cwd: string;
  /** Names of the variables the commands exported. */
  exported: string[];
  /** `command` with credential values hidden, at most 200 characters; `seconds`: how long it had run. */
  stoppedProcesses: { pid: number; command: string; seconds: number }[];
}

export interface BulkResult {
  results: { id: string; ok: boolean; error?: string }[];
}

// ---------------------------------------------------------------- actions

/** Viewport coordinates in CSS pixels, from the top-left corner (the session's viewport, 1280×720 by default). */
export interface Point {
  x: number;
  y: number;
}
export type MouseButton = "left" | "right" | "middle";
/** Where a drag starts or ends: a point, or a selector (the element's centre, scrolled into view). */
export type DragTarget = Point | string;

export type Action =
  | { action: "goto"; url: string; waitUntil?: WaitUntil }
  /** A selector or x/y; `count` 2 is a double click, 3 a triple click; `modifiers` are keys held, e.g. ["Shift"]. */
  | { action: "click"; selector?: string; x?: number; y?: number; button?: MouseButton; count?: 1 | 2 | 3; modifiers?: string[] }
  | { action: "fill"; selector: string; value: string }
  | { action: "type"; text: string; selector?: string; delayMs?: number }
  /**
   * Types a credential's value without it passing through you (see Session.typeCredential): `field` is `"username"`,
   * `"password"` or `"otp"` (the current 2FA code) for a password, and left out for a secret. A credential with sites
   * (every password) goes only into the field `selector` names, on one of those sites.
   */
  | { action: "type"; credential: string; field?: CredentialField; selector?: string; allowWithExtensions?: boolean }
  | { action: "press"; key: string }
  /** A combination held together ("Control+A" or ["Control", "A"]); a string may hold several, separated by spaces. */
  | { action: "key"; keys: string | string[]; holdMs?: number }
  /** Moves the pointer to x/y first when given, then turns the wheel (pixels). */
  | { action: "scroll"; deltaY?: number; deltaX?: number; x?: number; y?: number; modifiers?: string[] }
  /** To x/y, or by dx/dy from where the pointer is, in a straight line through `steps` points. Value: {x, y}. */
  | { action: "move"; x?: number; y?: number; dx?: number; dy?: number; steps?: number; modifiers?: string[] }
  | { action: "hover"; selector?: string; x?: number; y?: number }
  | { action: "mouse_down"; button?: MouseButton }
  | { action: "mouse_up"; button?: MouseButton }
  /** From `from` to `to` in `steps` points (default 10), or along `path` (2–200 points). Value: {from, to}. */
  | { action: "drag"; from?: DragTarget; to?: DragTarget; path?: Point[]; steps?: number; button?: MouseButton; modifiers?: string[] }
  /** Value: {x, y}, where the API last moved the pointer on this tab. */
  | { action: "cursor" }
  | { action: "wait"; selector?: string; ms?: number }
  /** `maxWidth` scales it down (viewport screenshots only); `cursor` draws the pointer. */
  | { action: "screenshot"; fullPage?: boolean; format?: "png" | "jpeg"; quality?: number; maxWidth?: number; cursor?: boolean }
  | { action: "content"; format?: "markdown" | "html" | "text" }
  | { action: "evaluate"; expression: string }
  /** Sets a file input to a file in the session's workspace. */
  | { action: "upload"; selector: string; path: string }
  /** Picks an option of a select element by label or value. */
  | { action: "select"; selector: string; option: string }
  /** The page as a model sees it: title, URL, visible text and numbered interactive elements. */
  | { action: "elements" }
  | { action: "tabs" }
  | { action: "newTab"; url?: string }
  | { action: "switchTab"; index: number }
  | { action: "closeTab"; index?: number }
  | { action: "back" }
  | { action: "forward" }
  | { action: "reload" }
  /** A plain-English step; a model picks one action. Use %name% for `variables` (their values never reach the model). */
  | {
      action: "step";
      instruction: string;
      variables?: Record<string, string>;
      /**
       * Credentials usable as placeholders (scope "agent" or "all"): `%NAME%` for a secret, `%NAME.username%`,
       * `%NAME.password%` and `%NAME.otp%` for a password, each on its own sites; never shown in the result. A
       * credential the session's profile links is offered too.
       */
      credentials?: string[];
      /** Allow `credentials` in a session with Chrome extensions (VariablesWithExtensionsError otherwise). */
      allowWithExtensions?: boolean;
      provider?: AgentProvider;
      model?: string;
      targetId?: string;
    }
  /** Structured data from the current page (instruction and/or JSON Schema). */
  | { action: "extract"; instruction?: string; schema?: Record<string, unknown>; provider?: AgentProvider; model?: string; targetId?: string }
  /**
   * Signs the browser in with a password credential (default: the one the session's profile links) in one call, see
   * Session.login. It runs alone: the only action of its request.
   */
  | { action: "login"; credential?: string; url?: string; allowWithExtensions?: boolean };

/** An action, or a plain-English step written as a bare string ("click Sign in"). */
export type ActionItem = Action | string;

export interface ActionResult {
  ok: boolean;
  action: string;
  /** The action's result (see each action); StepResult for step. */
  value?: any;
  /** One line saying what happened ("Dragged from (180, 200) to (400, 200) in 10 steps"); never typed text. */
  text?: string;
  error?: string;
  /** A stable error code when there is one (e.g. "captcha_timeout", "out_of_viewport"; for `login`: "credential_login_failed", "credential_login_timeout", "credential_code_timeout", "credential_link_wrong_site"). */
  code?: string;
  /** `login`: the agent run that signed in (also in its value when it worked). */
  runId?: string;
  ms: number;
}

/** What `Session.login` returns: the page the browser is on after signing in (no query or fragment) and the run that did it. */
export interface LoginValue {
  url: string;
  title: string;
  runId: string;
}

export interface GotoResult {
  url: string;
  title: string;
  status: number | null;
}
export interface PageContent {
  url: string;
  title: string;
  content: string;
}
export interface ScreenshotValue {
  /** Base64. */
  data: string;
  mimeType: string;
  /** With maxWidth or cursor: the image's size, and image pixels per CSS pixel. */
  width?: number;
  height?: number;
  scale?: number;
}

// ---------------------------------------------------------------- computer use

/**
 * The input of a tool_use block of Claude's `computer` tool (computer_20250124, computer_20251124), as the model
 * gives it. Coordinates are screenshot pixels.
 */
export interface AnthropicComputerAction {
  action:
    | "screenshot"
    | "cursor_position"
    | "mouse_move"
    | "left_click"
    | "right_click"
    | "middle_click"
    | "double_click"
    | "triple_click"
    | "left_mouse_down"
    | "left_mouse_up"
    | "left_click_drag"
    | "scroll"
    | "key"
    | "hold_key"
    | "type"
    | "wait"
    | "zoom";
  coordinate?: [number, number];
  start_coordinate?: [number, number];
  /** type: the text; key / hold_key: keys (xdotool style, "ctrl+s"); clicks and scroll: keys held. */
  text?: string;
  key?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  duration?: number;
  region?: [number, number, number, number];
}

/** One item of an OpenAI computer_call's `actions` (GA `computer` tool). Coordinates are screenshot pixels. */
export interface OpenAIComputerAction {
  type: "click" | "double_click" | "drag" | "keypress" | "move" | "screenshot" | "scroll" | "type" | "wait";
  x?: number;
  y?: number;
  button?: "left" | "right" | "wheel" | "back" | "forward";
  keys?: string[];
  path?: Point[];
  scroll_x?: number;
  scroll_y?: number;
  text?: string;
}

export type ComputerAction = AnthropicComputerAction | OpenAIComputerAction;

export interface ComputerOptions {
  /**
   * Scale the screenshot down to at most this width (100–3840); the action's coordinates are then read in that
   * screenshot's pixels. Send the same value on every call of a conversation.
   */
  maxWidth?: number;
  /** Default true; false skips the screenshot (e.g. for all but the last action of an OpenAI batch). */
  screenshot?: boolean;
  format?: "png" | "jpeg";
  quality?: number;
  /** Draw the pointer on the screenshot. */
  cursor?: boolean;
}

/** What POST /v1/sessions/:id/computer answers: what happened, and the screen after it. */
export interface ComputerResult {
  ok: boolean;
  /** The provider's action name. */
  action: string;
  shape: "anthropic" | "openai";
  /** One line saying what happened. */
  text: string;
  error?: string;
  code?: string;
  /** Base64 image, or null with screenshot: false. */
  screenshot: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  /** Screenshot pixels per CSS pixel. */
  scale: number;
  /** The pointer, in screenshot pixels. */
  cursor: Point;
  url: string;
  title: string;
}
/** The page as a model sees it; `elements` is one line per numbered interactive element. */
export interface PageElements {
  url: string;
  title: string;
  text: string;
  elements: string;
  count: number;
}
export interface TabList {
  current: number;
  tabs: { index: number; url: string; title: string }[];
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** What a plain-English step did. `code` is the equivalent Playwright line for an exported script. */
export interface StepResult {
  /** goto, click, fill, type, press, select, check, uncheck, hover, scroll, wait, extract, shell or none. */
  method: string;
  description: string;
  element?: { id: number; role: string; name: string };
  code: string;
  data?: unknown;
  url: string;
  title: string;
  model: string;
  usage: ModelUsage;
}

export interface ExtractValue<T = unknown> {
  data: T;
  model: string;
  usage: ModelUsage;
}

// ---------------------------------------------------------------- shell and files

/** Options of a plain-English step (session.step). */
export interface StepOptions {
  /** Text values for %name% placeholders. */
  variables?: Record<string, string>;
  /**
   * Credentials usable as placeholders (scope "agent" or "all"): `%NAME%` for a secret, `%NAME.username%`,
   * `%NAME.password%` and `%NAME.otp%` for a password. Each is typed only on its own sites and, in the shell, only
   * with `shell: true`. The step's result never shows their values. In a session whose profile links a password
   * credential, that credential is offered too.
   */
  credentials?: string[];
  /**
   * Allow `credentials` in a session with Chrome extensions, which can read every typed value
   * (VariablesWithExtensionsError otherwise). Logs a warning in the session's events.
   */
  allowWithExtensions?: boolean;
  provider?: AgentProvider;
  model?: string;
}

export interface ExecOptions {
  timeoutMs?: number;
  /** The directory for this command only (inside the workspace); the shell stays where it was. */
  cwd?: string;
  /** Variables for this command only (it may set PATH, HOME and the like for itself). */
  env?: Record<string, string>;
  /**
   * Credentials as environment variables for this command only (scope "shell" or "all", or shell: true): a secret as
   * `$NAME`, a password as `$NAME_USERNAME` and `$NAME_PASSWORD`, and `boxline-otp NAME` prints its 2FA code. Hidden in the output.
   */
  credentials?: string[];
  /** Named persistent shell (default "default"); false runs in a fresh process with no kept state. */
  shell?: string | false;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  /** The output was cut (it was too long). */
  truncated: boolean;
  durationMs: number;
}

export interface ExecExit {
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  truncated: boolean;
}

export interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface RunScriptOptions {
  env?: Record<string, string>;
  timeoutMs?: number;
  /** The model step() and extract() use unless a call (or useModel()) picks its own. */
  ai?: { provider?: AgentProvider; model?: string };
  /**
   * Credentials the script's step() calls may use as placeholders (scope "agent" or "all"). The values never enter the
   * machine: the platform fills them in when the step runs. The grant is for this run only. A credential the
   * session's profile links is used only when it is listed here.
   */
  credentials?: string[];
  /**
   * Allow `credentials` in a session with Chrome extensions, which can read every typed value
   * (VariablesWithExtensionsError otherwise); a warning goes into the session's events.
   */
  allowWithExtensions?: boolean;
  /** Aborting it stops the script. */
  signal?: AbortSignal;
  onData?: (stream: "stdout" | "stderr", data: string) => void;
}

export interface FileEntry {
  name: string;
  type: "file" | "dir" | "other";
  size: number;
  /** ISO date. */
  mtime: string;
}
export interface FileList {
  path: string;
  entries: FileEntry[];
}
export interface FileRef {
  path: string;
  size: number;
}

// ---------------------------------------------------------------- logs and recording

export interface SessionEvent {
  seq: number;
  at: string;
  type: "console" | "network" | "navigation" | "error" | "lifecycle" | "action" | "exec" | "captcha";
  level?: string;
  text?: string;
  url?: string;
  method?: string;
  status?: number;
  resourceType?: string;
  durationMs?: number;
  tabId?: string;
  data?: Record<string, unknown>;
}

export interface SessionEventsParams {
  types?: SessionEvent["type"][];
  /** An event seq, or the previous page's `next`. */
  after?: number | string;
  /** Per page: 1–2000, default 500. */
  limit?: number;
}

export interface VisitedPage {
  tabId: string;
  url: string;
  title: string;
  visits: number;
  firstSeen: string;
  lastSeen: string;
}

export interface Recording {
  frames: { index: number; at: string; url: string | null }[];
  durationMs: number;
}

// ---------------------------------------------------------------- profiles

export interface Profile {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  /** The running session using it. */
  inUseBy: string | null;
  /**
   * The name of the password credential it signs in with (profiles.update with `credential`), or null. Sessions with
   * the profile, and agent runs, task runs and steps in them, get it as if it were listed in their `credentials`.
   */
  credential: string | null;
}

/** profiles.update: any of these (at least one). */
export interface ProfileUpdateParams {
  /** 1 to 100 characters. */
  name?: string;
  /**
   * Link the password credential this profile signs in with, so the AI can sign in again when its cookies have
   * expired; null unlinks it. NotFoundError (404 `credential_not_found`) for a name the project does not have, 400 for a secret (only
   * passwords sign in), FeatureNotInPlanError (402) without `loginDetails`.
   */
  credential?: string | null;
}

// ---------------------------------------------------------------- web

/** Options shared by fetch, screenshot and pdf. */
export interface RenderOptions {
  /** Open the page through a proxy (the IP rotates per request unless ip: "sticky"). */
  proxy?: ProxyOption;
  /** The page's clock and language (see BrowserOptions). */
  browser?: boolean | BrowserOptions;
  timeoutMs?: number;
  waitUntil?: WaitUntil;
  viewport?: Viewport;
  /** Extra wait after the page loads (ms, up to 10 000). */
  delayMs?: number;
  /** Refuse requests to ad and tracker sites for this page. */
  blockAds?: boolean;
}

export interface FetchParams extends RenderOptions {
  format?: "markdown" | "html" | "text";
  /** Also return the page's absolute http(s) links (at most 2000). */
  links?: boolean;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number | null;
  title: string;
  content: string;
  /** A CAPTCHA waiting for a person on the page, or null. */
  captcha: CaptchaKind | null;
  ms: number;
  /** With `links: true`. */
  links?: string[];
}

export interface ScreenshotParams extends RenderOptions {
  fullPage?: boolean;
  format?: "png" | "jpeg";
  /** JPEG only, 1–100. */
  quality?: number;
  /** Only this element. */
  selector?: string;
}

export interface PdfParams extends RenderOptions {
  paper?: "A4" | "A3" | "A5" | "Letter" | "Legal" | "Tabloid";
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number;
}

export interface ExtractParams {
  url?: string;
  /** Up to 10 pages. */
  urls?: string[];
  prompt?: string;
  /** A JSON Schema for the result. */
  schema?: Record<string, unknown>;
  provider?: AgentProvider;
  model?: string;
  proxy?: ProxyOption;
  browser?: boolean | BrowserOptions;
  waitUntil?: WaitUntil;
  delayMs?: number;
  timeoutMs?: number;
  /** Refuse requests to ad and tracker sites for these pages. */
  blockAds?: boolean;
}

export interface ExtractResult<T = unknown> {
  data: T;
  provider: AgentProvider;
  model: string;
  keySource: ModelKeySource;
  usage: ModelUsage;
  /**
   * Every page asked for, in order. With several `urls`, a page that did not load (`page_unreachable`,
   * `page_timeout`) is left out of the model's input and has `status: null`, `finalUrl: null` and an `error`; the call
   * fails only when none load.
   */
  pages: { url: string; finalUrl: string | null; status: number | null; title: string; error?: { code: string; message: string } }[];
  ms: number;
}

export interface SearchParams {
  /** 1–400 characters (at most 75 words). Operators work: "exact words", -word, site:example.com, filetype:pdf. */
  query: string;
  /** 1–20 results (default 10). */
  limit?: number;
  /** Where the results come from, e.g. "DE", or "ALL" (default US). */
  country?: string;
  /** The results' language, e.g. "de" (default en). */
  language?: string;
  recency?: "day" | "week" | "month" | "year";
  safeSearch?: "off" | "moderate" | "strict";
  /** Also open the top pages in a sandboxed browser and return them as Markdown: true = the top 3, or 0–5. */
  fetch?: boolean | number;
  /** For the pages `fetch` opens only (the search itself never goes through it). */
  proxy?: ProxyOption;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  siteName?: string;
  /** Fetched results only: the page as Markdown, or null when it could not be loaded. */
  content?: string | null;
  page?: { finalUrl: string; status: number | null; title: string; captcha: CaptchaKind | null; ms: number } | null;
  error?: { code: string; message: string } | null;
}

export interface SearchResponse {
  /** The query as searched (white space collapsed). */
  query: string;
  results: SearchResult[];
  /** The whole request, fetched pages included. */
  ms: number;
  /** Answered from this project's cache (the same search in the last hour): not counted. */
  cached: boolean;
}

export interface CrawlParams {
  url: string;
  /** Sticky by default: one IP per crawl. */
  proxy?: ProxyOption;
  browser?: boolean | BrowserOptions;
  /** 1–200, default 20. */
  maxPages?: number;
  /** 0–10, default 3. */
  maxDepth?: number;
  sameHost?: boolean;
  /** Regular expressions a URL must match. */
  include?: string[];
  /** Regular expressions that skip a URL. */
  exclude?: string[];
  format?: "markdown" | "text" | "html";
  waitUntil?: WaitUntil;
  delayMs?: number;
  timeoutMs?: number;
  /** Refuse requests to ad and tracker sites on every page of the crawl. */
  blockAds?: boolean;
}

export interface CrawlPage {
  index: number;
  url: string;
  finalUrl: string | null;
  status: number | null;
  title: string | null;
  depth: number;
  content: string | null;
  captcha: CaptchaKind | null;
  error: string | null;
}

export interface CrawlJob {
  id: string;
  status: "running" | "completed" | "failed" | "canceled";
  url: string;
  /** The crawl's settings (proxy without passwords). */
  params: Record<string, unknown>;
  pagesDone: number;
  pagesFailed: number;
  skippedByRobots: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  /** A page of the crawl's pages (empty in lists). */
  data: CrawlPage[];
  /** The cursor of the next page of pages (pass it as `after`), or null. */
  next: string | null;
}

export interface CrawlGetParams {
  /** Pages per call: 0–100, default 50 (0 = the job only). */
  limit?: number;
  after?: string;
}

// ---------------------------------------------------------------- agent

export interface AgentModelCatalog {
  default: { provider: AgentProvider; model: string };
  providers: {
    id: AgentProvider;
    name: string;
    /** A call could be made now for this project (a key exists for the source its settings choose). */
    available: boolean;
    /** Whose key a call would use now; null when there is none. */
    keySource: ModelKeySource | null;
    reason: string | null;
    models: {
      id: string;
      name: string;
      note: string;
      pricePerMTok: { input: number; output: number };
      supportsEffort: boolean;
      /** Agent runs with mode "computer" work with this model. */
      supportsComputerUse: boolean;
      /** The computer-use tool the model gets in mode "computer" (Anthropic tool version, or OpenAI's "computer"). */
      computerTool: "computer_20251124" | "computer_20250124" | "computer" | null;
      default: boolean;
    }[];
  }[];
}

/**
 * An agent-run variable: the value, or the value with limits. `origins`: sites whose fields may receive it, e.g.
 * ["https://example.com", "https://*.example.com"] (scheme, host and port must match; "*." = any subdomain).
 * `shell`: bash commands may use it too. The plain string form has no site limit and no shell use.
 */
export type AgentVariable = string | { value: string; origins?: string[]; shell?: boolean };

/** "tools" (default): the page view and browser tools. "computer": the provider's computer-use tool on screenshots. */
export type AgentMode = "tools" | "computer";

/**
 * Structured output: a JSON Schema the answer must match, e.g.
 * `{type: "object", properties: {title: {type: "string"}, price: {type: "number"}}, required: ["title", "price"]}`.
 * At most 32 KB (as JSON), 2,000 parts and 32 levels deep, with `$ref` only inside the schema ("#/$defs/…"); checked
 * when the run or task is created (400 invalid_request names the place). Enforced: type (nullable too), enum, const,
 * properties, required, additionalProperties, items, prefixItems, min/maxItems, uniqueItems, min/maxLength, minimum,
 * maximum, exclusiveMinimum/Maximum, multipleOf, min/maxProperties, allOf, anyOf, oneOf, not, $ref. Given to the model
 * but not enforced: pattern, patternProperties, format. An answer that does not match gets one repair try, then the
 * run fails with errorCode "output_invalid".
 */
export type OutputSchema = Record<string, unknown>;

export interface AgentRunParams {
  task: string;
  /** Work in this session (its own settings apply) instead of a new one. */
  sessionId?: string;
  /** `false` for a run without a browser, or options for the run's own session (see BrowserOptions). */
  browser?: boolean | BrowserOptions;
  shell?: boolean;
  /**
   * Seconds for the run's own session (default 1800, or the plan's maximum when shorter; PlanLimitError above it). Not
   * with sessionId: that session keeps its own time (extend it with sessions.extend).
   */
  timeout?: number;
  /** The run's own session's idleTimeout (see CreateSessionParams.idleTimeout). Not with sessionId. */
  idleTimeout?: number;
  /**
   * The run's work budget in model turns: 1–1000, default 30. `null`: no step limit, the run goes until it is done or
   * its session's time ends it (set a maxCostUsd or a sensible timeout then). At the limit it stops with errorCode
   * "max_steps" and can be continued (agent.continueRun).
   */
  maxSteps?: number | null;
  /**
   * A money budget next to maxSteps (0.01–100 USD of model cost, as usage.costUsd counts it), checked before each model
   * call: the run stops with errorCode "max_cost" (continuable) once it is reached; one call can go past it. Default none.
   */
  maxCostUsd?: number | null;
  /** Tool errors in a row after which the run stops with errorCode "too_many_errors" (continuable): 1–20, default 5. */
  maxConsecutiveErrors?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Keep the run's own session after it finishes (until its expiresAt, with keepAlive on). */
  keepSession?: boolean;
  /**
   * Credentials as placeholders, exactly like `variables`, each with the credential's own `origins` and `shell` rule
   * (scope "agent" or "all"; CredentialNotAllowedError for scope "shell"): `%NAME%` for a secret, `%NAME.username%`,
   * `%NAME.password%` and `%NAME.otp%` for a password. An explicit variable with the same name wins. A password
   * credential linked to the session's profile is added for you.
   */
  credentials?: string[];
  /**
   * For the run's own session: a profile to start with. When it links a password credential (profiles.update), the
   * run gets that credential as if it were listed in `credentials`.
   */
  profile?: { id: string; persist?: boolean };
  /** "anthropic" or "openai"; defaults to the first configured provider. */
  provider?: AgentProvider;
  /** e.g. "claude-opus-5", "claude-sonnet-5", "gpt-6-sol"; defaults to the provider's default model. */
  model?: string;
  /** A proxy for the run's own session (ignored with sessionId: that session's proxy applies). */
  proxy?: ProxyOption;
  /** CAPTCHAs on the run's own session: "ask" (default) pauses until a person solves one; "ignore" carries on; "solve" tries first. */
  captcha?: CaptchaMode;
  /**
   * "computer": the model drives the page with its provider's own computer-use tool on screenshots (models with
   * supportsComputerUse in agent.models(); 400 otherwise, or without a browser). Default "tools".
   */
  mode?: AgentMode;
  /** For the run's own session (with sessionId that session's settings apply). */
  blockAds?: boolean;
  cookieBanners?: CookieBanners;
  extensions?: string[];
  /**
   * Allow `variables` in a session with extensions, which can read every typed value (400
   * `variables_with_extensions` otherwise); a warning goes into the session's events.
   */
  allowWithExtensions?: boolean;
  /**
   * Secrets and other values the agent may type as %name% placeholders (e.g. a task "sign in with %email% and
   * %password%"). The model is told the names only. A value is filled in only where the model types text
   * (browser_type) or picks an option (browser_select), never into URLs, selectors or keys; shell commands only
   * with `shell: true`. `origins` limits typing it to fields on those sites (recommended for passwords). Values are
   * replaced by their placeholder in everything the model sees and the run stores, and kept in memory for the run
   * only. Up to 50; names are letters, digits and _ (not starting with a digit, 64 characters at most); values up
   * to 8000 characters, 64 KB together. Values shorter than 3 characters are filled in but cannot be hidden.
   */
  variables?: Record<string, AgentVariable>;
  /**
   * Structured output (see OutputSchema): the run's `result` is then the JSON answer matching this schema, and
   * `resultText` a one-sentence summary. Type the answer when you read the run: `bx.agent.wait<Books>(id)`.
   */
  output?: OutputSchema;
}

export interface AgentRunStarted {
  id: string;
  status: "running";
  sessionId: string;
  /** When the run's session ends by its time limit (the run stops then, errorCode "session_timeout"). */
  sessionExpiresAt?: string | null;
  provider: AgentProvider;
  model: string;
  /** Whose key pays for the run's model calls ("project": the project's own key, no model charge from Boxline). */
  keySource: ModelKeySource;
  mode: AgentMode;
}

/**
 * A run's `errorCode`. The first four are limits: the run stopped without finishing and can be continued
 * (agent.continueRun) while `continuable` is set; so can "server_restarted" (the API server running it stopped while its
 * session went on). "session_timeout": its session reached its time limit; "session_ended":
 * its session ended another way (`error` names how); "output_invalid": the answer did not match the output schema;
 * "internal": an error on the platform's side. Other codes are those of the platform error that stopped it.
 */
export type AgentRunErrorCode =
  | "spend_limit"
  | "max_steps"
  | "max_cost"
  | "too_many_errors"
  | "no_progress"
  | "server_restarted"
  | "session_timeout"
  | "session_ended"
  | "output_invalid"
  | "internal"
  | "spend_limit"
  | "captcha_timeout"
  | "handover_timeout"
  | (string & {});

/** The body of agent.continueRun. */
export interface ContinueRunParams {
  /** 1–1000, or null for no step limit (default: the run's own). */
  maxSteps?: number | null;
  /** The new run's own money budget, 0.01–100 USD, or null for none (default: the run's own). */
  maxCostUsd?: number | null;
  /** An extra note for the model, at most 2000 characters (the new run's first `message` step). */
  instruction?: string;
  /**
   * The original run's variables again (their values are never stored): every name, as text or `{value}`. They keep the
   * sites and shell rule they had (MissingVariablesError when one is missing).
   */
  variables?: Record<string, string | { value: string }>;
}

/** agent.sendMessage's answer: queued for the agent's next step. */
export interface AgentMessageSent {
  id: string;
  at: string;
  delivered: false;
}

export interface AgentStep {
  /** message: a message you sent (agent.sendMessage), recorded when the model received it. */
  /** code: the run waits for a password's 2FA code or sign-in link (`credentials.pushCode`, or your `codeUrl`), see `state`. */
  type: "text" | "tool" | "handover" | "handback" | "captcha" | "message" | "code";
  at: string;
  /** message steps: who wrote it, its id, when it was sent (`at` is when the model got it). */
  from?: "user";
  id?: string;
  sentAt?: string;
  delivered?: boolean;
  /** handover: who paused the run; captcha "solved": who solved it. */
  by?: "user" | "agent" | "captcha" | "auto" | "person";
  text?: string;
  /** tool and handover steps: the model's own words with the call (what it is doing and will do next), redacted. */
  thought?: string;
  name?: string;
  /** A tool's input as the model wrote it: variables appear as %name%, never as their values. */
  input?: unknown;
  output?: string;
  isError?: boolean;
  ms?: number;
  /**
   * captcha steps: "solving" (automatic solving), "waiting" (a person's turn), "solved" (the run goes on); code steps:
   * "waiting" (a wait began: push the code or link now), then "received" or "timeout". Never the code or the link.
   */
  state?: "solving" | "waiting" | "solved" | "received" | "timeout";
  /** code steps: the password credential whose code or link the run waits for. */
  credential?: string;
  /** captcha steps: the CAPTCHA kind and the host of its page; code steps: "code" or "link". */
  kind?: string;
  host?: string;
  /** captcha "waiting": why a person is asked. */
  reason?: string;
}

/**
 * An agent run. `T` is the type of `result`: the final text (string, the default) for a plain run, or the JSON answer
 * for a run with an `output` schema: read it as `bx.agent.get<Books>(id)` / `bx.agent.wait<Books>(id)`, or with
 * `unknown` and check it yourself.
 */
export interface AgentRun<T = string> {
  id: string;
  /** paused: the user has the browser (took it over, or the agent asked for help). */
  status: "running" | "paused" | "completed" | "failed" | "canceled";
  task: string;
  sessionId: string;
  /** The session's expiresAt: the run stops then (session_timeout). */
  sessionExpiresAt?: string | null;
  provider: AgentProvider;
  model: string;
  /** Whose key paid for the run's model calls: "project" is the project's own key (no model charge from Boxline). */
  keySource: ModelKeySource;
  mode: AgentMode;
  /** Its limits: steps (null: none), model cost in USD (null: none), tool errors in a row. */
  maxSteps?: number | null;
  maxCostUsd?: number | null;
  maxConsecutiveErrors?: number;
  /**
   * handover / handback steps mark when the user had the browser. `captcha` steps say what happened to a CAPTCHA the
   * run paused for: `state` "solving" (automatic solving), "waiting" (a person's turn, with `reason`), then "solved"
   * with `by` ("auto" or "person") and `ms` (how long the run waited).
   */
  steps: AgentStep[];
  /** The final text of a completed run; with an `output` schema, the JSON answer (null unless the run completed). */
  result: T | null;
  /**
   * The final text; with an `output` schema, the model's one-sentence summary of the answer; for a run that stopped at a
   * limit, the model's short account of what is done and what is left.
   */
  resultText?: string | null;
  /** The run's output schema, or null. */
  output?: OutputSchema | null;
  error: string | null;
  errorCode?: AgentRunErrorCode | null;
  /** Set while the run can be continued (agent.continueRun): it stopped at a limit, and its session is kept until then. */
  continuable?: { until: string } | null;
  /** The run this one continues, and the run that continued this one. */
  continuedFrom?: string | null;
  continuedBy?: string | null;
  /** The names of the run's own variables (never values): continueRun needs their values again. */
  variableNames?: string[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  /** Set while paused: who asked for the handover and why ("captcha": the run continues by itself once it is solved). */
  handover: { by: "user" | "agent" | "captcha"; reason: string | null } | null;
  /** Set when a task started the run (tasks.run, or its schedule). */
  taskId?: string | null;
  taskRunId?: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** One event of an agent run's live stream (agent.stream); `T` as on AgentRun (the type of the final `result`). */
export type AgentRunEvent<T = string> =
  | AgentStep
  /** The model's words, as soon as its reply arrives (before its tool runs; then that step's `thought`). */
  | { type: "thought"; text: string; at: string }
  | { type: "status"; status: AgentRun["status"]; by?: string; reason?: string | null }
  | { type: "exec"; command: string; at: string }
  | { type: "output"; stream: "stdout" | "stderr"; data: string }
  | {
      type: "done";
      status: AgentRun["status"];
      result: T | null;
      resultText?: string | null;
      error: string | null;
      errorCode?: AgentRunErrorCode | null;
      continuable?: { until: string } | null;
    };

// ---------------------------------------------------------------- tasks

/**
 * A variable of a task, written in its instruction as %name%.
 * - Plain (the default): the value (from the run, else the schedule, else `default`) is written into the instruction,
 *   so the model reads it, and is kept with the run.
 * - `secret: true`: the value is never stored anywhere (so no `default`), must come with every run, and is typed by the
 *   agent without the model seeing it (as agent-run variables: `origins`, `shell`). A task with one cannot have a
 *   schedule.
 */
export interface TaskVariable {
  /** Letters, digits and _ (not starting with a digit), 64 characters at most. */
  name: string;
  secret?: boolean;
  /** Plain variables only: the value when a run (or the schedule) gives none. */
  default?: string | null;
  /** For people (the console's run form), up to 500 characters. */
  description?: string | null;
  /** Secret variables only: the sites whose fields may receive the value, e.g. ["https://example.com"]. */
  origins?: string[] | null;
  /** Secret variables only: bash commands may use it. */
  shell?: boolean;
}

/**
 * The settings of each run's own session, as on sessions.create, checked when saved and again at each run. A custom
 * proxy's password is stored encrypted and never returned. `allowWithExtensions` is needed for a task with secret
 * variables or credentials and extensions (VariablesWithExtensionsError otherwise).
 */
export interface TaskBrowser extends BrowserOptions {
  shell?: boolean;
  proxy?: ProxyOption | null;
  captcha?: CaptchaMode;
  viewport?: Viewport;
  /** Seconds for each run's own session (as timeout on agent.run), and its idleTimeout. */
  timeout?: number;
  idleTimeout?: number;
  blockAds?: boolean;
  cookieBanners?: CookieBanners;
  /** This project's uploaded extensions (the plan's `extensions`), at most 10. */
  extensions?: string[];
  allowWithExtensions?: boolean;
}

/** A task's schedule as you set it; on update its fields are merged into the current schedule. */
export interface TaskScheduleInput {
  /**
   * Five fields (minute hour day-of-month month day-of-week) with `*`, numbers, ranges, steps and lists, names JAN–DEC and
   * SUN–SAT, or @hourly, @daily, @weekly, @monthly, @yearly. At most every 5 minutes. E.g. "0 9 * * MON-FRI".
   */
  cron?: string;
  /** An IANA time zone the cron is read in (default "UTC"). */
  timezone?: string;
  /** Values for the task's plain variables (their defaults fill the rest). */
  variables?: Record<string, string>;
  /** Default true. Switching it on, or changing cron or timezone, counts the next run from now. */
  enabled?: boolean;
}

export interface TaskSchedule {
  cron: string;
  timezone: string;
  variables: Record<string, string>;
  enabled: boolean;
  /** When it runs next; null while switched off. */
  nextRunAt: string | null;
  /** The next 3 times it fires, ISO in UTC (the first is nextRunAt), on the schedule's time zone and DST; [] while switched off. */
  nextRuns: string[];
}

/** A task's newest run (by hand or scheduled, queued included; skipped and missed times are not runs). */
export interface TaskLastRun {
  id: string;
  /** As in the run history: it follows the agent run while that works. */
  status: Exclude<TaskRunStatus, "skipped" | "missed">;
  /** Why it stopped (`max_steps`, `session_timeout`, …), as on its agent run; null while working or when completed. */
  errorCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** A browser profile each run's session starts with: its id, or `{id, persist}` (persist: keep what the run changes). */
export type TaskProfile = string | { id: string; persist?: boolean };

export interface TaskCreateParams {
  /** 1–100 characters. */
  name: string;
  /** What the agent does, with %name% where a variable goes (up to 20,000 characters). */
  instruction: string;
  /** Up to 50. */
  variables?: TaskVariable[];
  /**
   * Credentials (by name, up to 50) each run gets as placeholders, as `credentials` on agent runs. They must exist with
   * scope "agent" or "all"; a scheduled task may use them (secret variables cannot be scheduled).
   */
  credentials?: string[];
  /** Structured output for every run (see OutputSchema). */
  output?: OutputSchema;
  browser?: TaskBrowser;
  profile?: TaskProfile;
  /** From agent.models() (default: the server's default model). */
  model?: { provider?: AgentProvider; model?: string };
  /** 1–1000 (default 30), or null for no step limit. */
  maxSteps?: number | null;
  /** Each run's money budget, 0.01–100 USD (as maxCostUsd on agent.run); default none. */
  maxCostUsd?: number | null;
  /** Stored only: no email is sent yet. */
  notifyOnFailure?: "email" | null;
  /** Run it on a schedule (the plan's `schedules`; PlanLimitError beyond). */
  schedule?: TaskScheduleInput;
}

/** Any TaskCreateParams fields; `null` removes the optional ones. `schedule` fields are merged into the current schedule. */
export interface TaskUpdateParams {
  name?: string;
  instruction?: string;
  variables?: TaskVariable[];
  /** The whole new list; null or [] removes them. */
  credentials?: string[] | null;
  output?: OutputSchema | null;
  browser?: TaskBrowser | null;
  profile?: TaskProfile | null;
  model?: { provider?: AgentProvider; model?: string } | null;
  /** null: no step limit. */
  maxSteps?: number | null;
  /** null removes it. */
  maxCostUsd?: number | null;
  notifyOnFailure?: "email" | null;
  /** e.g. `{enabled: false}` pauses it; null removes it. */
  schedule?: TaskScheduleInput | null;
}

/** A task as stored: secret variables without values, `browser.proxy` without its password. */
export interface Task {
  id: string;
  name: string;
  instruction: string;
  variables: TaskVariable[];
  /** Names of the credentials its runs get (never values). */
  credentials: string[];
  output: OutputSchema | null;
  browser: TaskBrowser | null;
  profile: { id: string; persist: boolean } | null;
  model: { provider?: AgentProvider; model?: string } | null;
  /** null: no step limit (a task saved without one shows 30). */
  maxSteps: number | null;
  maxCostUsd?: number | null;
  notifyOnFailure: "email" | null;
  schedule: TaskSchedule | null;
  lastRunAt: string | null;
  /** The newest run, or null before the first. */
  lastRun: TaskLastRun | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * - queued: a scheduled run waiting for its turn to start (it fails with `not_started` after 10 minutes);
 * - running, paused (a person has the browser), then completed, failed or canceled, as its agent run;
 * - skipped, missed: a scheduled time that did not run (`reason`, `missedCount`).
 */
export type TaskRunStatus = "queued" | "running" | "paused" | "completed" | "failed" | "canceled" | "skipped" | "missed";

/**
 * One run of a task (by hand or on its schedule), or a scheduled time that did not run. `T` is the type of `result`:
 * the JSON answer when the task has an output schema (`structured`), else the final text.
 */
export interface TaskRun<T = unknown> {
  id: string;
  taskId: string;
  /** The agent run (agent.get(runId) has its steps); null while queued, for skipped and missed times, and for a scheduled run that could not start. */
  runId: string | null;
  sessionId: string | null;
  status: TaskRunStatus;
  scheduled: boolean;
  scheduledFor: string | null;
  /** skipped and missed: why the time did not run. */
  reason: "previous_run_running" | "plan_limit" | "not_running" | null;
  /** missed: how many scheduled times it stands for (counted up to 1,000). */
  missedCount: number | null;
  /** The plain values it ran with. */
  variables: Record<string, string>;
  /** The names of its secret variables, never their values. */
  secretVariables: string[];
  /** The result is JSON (the task has an output schema). */
  structured: boolean;
  /** The JSON answer (structured) or the final text; null until it completes. */
  result: T | null;
  resultText: string | null;
  error: string | null;
  /** e.g. "output_invalid", or why a scheduled run could not start ("no_capacity", "missing_variables", "not_started", …). */
  errorCode: string | null;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface TaskRunParams {
  /** Values by name. Secret variables must be given on every run; plain ones fall back to their defaults. */
  variables?: Record<string, string | number | boolean>;
  /** Work in this session (its own settings apply; the task's `browser` and `profile` do not). */
  sessionId?: string;
}

export interface TaskRunListParams extends ListParams {
  /** Only runs with these statuses. */
  status?: TaskRunStatus | TaskRunStatus[];
}

// ---------------------------------------------------------------- usage and prices

export interface Usage {
  from: string;
  to: string;
  sessions: number;
  running: number;
  browserSeconds: number;
  sandboxVcpuSeconds: number;
  sandboxGibSeconds: number;
  proxy: { residentialGb: number; datacenterGb: number; customGb: number; costUsd: number };
  /** Automatic CAPTCHA solving (captcha "solve"): attempts are billed whether solved or failed. */
  captchaSolves: { solved: number; failed: number; refused: number; costUsd: number };
  /** Web searches that reached the provider (cached answers are not counted); cost of those beyond the allowance. */
  searches: { count: number; costUsd: number };
  /** Includes proxy data, CAPTCHA solving and searches beyond the allowance. */
  costUsd: number;
  byDay: { date: string; seconds: number; costUsd: number }[];
}

export interface StatsDay {
  sessions: number;
  browserSeconds: number;
  costUsd: number;
  agentRuns: number;
  /** Model cost on the platform's keys (runs on the project's own keys are in `ownKeyModelCostUsd`). */
  modelCostUsd: number;
  ownKeyModelCostUsd: number;
}
export interface Stats {
  days: number;
  running: number;
  concurrencyLimit: number;
  totals: StatsDay;
  byDay: (StatsDay & { date: string })[];
}

export interface Pricing {
  currency: "USD";
  billing: string;
  browserSessionPerHour: number;
  sandboxPerVcpuHour: number;
  sandboxPerGibHour: number;
  defaultShellMachine: { vcpu: number; gib: number; perHour: number };
  pausedSessions: { freeHours: number; perGbMonthAfter: number };
  proxies: { residentialPerGb: number; datacenterPerGb: number; customPerGb: number };
  captchaSolving: { per1000Attempts: number };
  /** Searches included per month, and the price per 1,000 beyond them (null: none beyond), per public plan. */
  webSearch: { byPlan: Record<string, { includedPerMonth: number | null; extraPer1000Usd: number | null }> };
  plans: Plan[];
  /** A label for people per plan feature. */
  features: Record<PlanFeature, string>;
}

// ---------------------------------------------------------------- webhooks

/**
 * The events an endpoint can subscribe to (`webhook.test` needs no subscription). New types may be added: an endpoint
 * subscribed to "*" gets them too, so a receiver should ignore types it does not know.
 */
export type WebhookEventType =
  | "session.started"
  | "session.expiring"
  | "session.ended"
  | "agent_run.started"
  | "agent_run.waiting"
  | "agent_run.resumed"
  | "agent_run.finished"
  | "captcha.waiting"
  | "captcha.solved"
  | "captcha.failed"
  | "crawl.finished"
  | "task_run.started"
  | "task_run.finished"
  | "task.schedule_paused"
  | "usage.limit_reached"
  | "api_key.created"
  | "api_key.revoked"
  | "credential.code_needed"
  | "credential.changed"
  | "webhook.changed"
  | "webhook.disabled"
  | "extension.uploaded"
  | "extension.deleted";

/** What an endpoint subscribes to: event types, or "*" for all of them (those added later too). */
export type WebhookSubscription = WebhookEventType | "*";

/** One entry of bx.webhooks.eventTypes(): a type, its group (for pickers) and what it says. */
export interface WebhookEventTypeInfo {
  type: WebhookEventType;
  group: string;
  description: string;
}

export interface WebhookEventTypeList {
  data: WebhookEventTypeInfo[];
  /** "*": subscribe to it for every type. */
  all: "*";
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  /** The types it gets, or ["*"] for all of them. */
  events: WebhookSubscription[];
  description: string | null;
  enabled: boolean;
  /** "user": switched off with update; "gone": it answered 410; "failing": 3 days of failed deliveries. */
  /** `account_recovered`: a password reset recovered an account whose email had not been confirmed. */
  disabledReason: "user" | "gone" | "failing" | "account_recovered" | null;
  disabledAt: string | null;
  /** The first failed delivery since the last success. */
  failingSince: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  secretRotatedAt: string | null;
  /** Until then deliveries are also signed with the secret before the last rotation. */
  previousSecretExpiresAt: string | null;
  /** Deliveries wait until then because the endpoint timed out 3 times in a row (test events still go). */
  pausedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An endpoint just created or with a rotated secret: `secret` ("whsec_…") is shown only in this response. */
export interface NewWebhookEndpoint extends WebhookEndpoint {
  secret: string;
}

export interface WebhookCreateParams {
  /** Public HTTPS (400 webhook_url_not_allowed otherwise). */
  url: string;
  /** Event types, or ["*"] for all of them (those added later too). */
  events: WebhookSubscription[];
  description?: string;
}

export interface WebhookUpdateParams {
  url?: string;
  events?: WebhookSubscription[];
  /** true also after the platform switched it off (and forgets its failures); false: deliveries not yet made fail. */
  enabled?: boolean;
  description?: string | null;
}

/** Why a delivery or an attempt failed (null when delivered); the last five are deliveries that were never sent. */
export type WebhookErrorCode =
  | "bad_status"
  | "gone"
  | "timeout"
  | "connection_failed"
  | "tls_failed"
  | "address_not_allowed"
  | "gateway_unavailable"
  | "endpoint_disabled"
  | "project_suspended"
  | "payload_expired"
  | "queue_full"
  | "signing_failed";

export interface WebhookAttempt {
  at: string;
  /** The HTTP status of the answer, null when there was none. */
  status: number | null;
  durationMs: number;
  error: string | null;
  errorCode: WebhookErrorCode | null;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  /** The event's id: the same on every endpoint and every attempt (dedupe by it). */
  eventId: string;
  eventType: string;
  test: boolean;
  /** "pending": waiting for its next attempt; "failed": no more attempts. */
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  responseStatus: number | null;
  /** The first 1 KB of the last answer (kept 7 days). */
  responseBody: string | null;
  durationMs: number | null;
  error: string | null;
  errorCode: WebhookErrorCode | null;
  /** The last 20 attempts. */
  history: WebhookAttempt[];
  /** The body that was sent (the event); null after 7 days. */
  payload: WebhookEvent | null;
  createdAt: string;
}

export interface WebhookDeliveryListParams extends ListParams {
  status?: "pending" | "delivered" | "failed";
}

/**
 * The body of every delivery. Verify it with verifyWebhook() before trusting it, and drop an `id` already handled.
 * `verifyWebhook(body, header, secret) as WebhookEventPayload` gives the typed union below: switch on `type`
 * (verifyWebhook's own type parameter describes `data`, not the union).
 */
export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  type: WebhookEventType | "webhook.test";
  createdAt: string;
  projectId: string;
  /** Set on "send test" deliveries (webhook.test, and samples of other types): made-up data. */
  test?: boolean;
  data: T;
}

/** Who made a change: "user:<email>" (a console login), "key:<api key id>", "support" (support acting as you) or "platform". */
export type WebhookActor = string;

/** session.started and session.ended: the session as sessions.get returns it, with every URL (and attention) null. */
export type WebhookSessionData = Omit<SessionData, "setup" | "setupError"> & { userMetadataTruncated?: true };

export interface WebhookSessionExpiringData {
  sessionId: string;
  expiresAt: string;
  secondsLeft: number;
  userMetadata: Record<string, unknown> | null;
  userMetadataTruncated?: true;
}

export interface WebhookAgentRunStartedData {
  id: string;
  status: "running";
  /** At most 4000 characters; variables are their %name%. */
  task: string;
  sessionId: string;
  provider: AgentProvider;
  model: string;
  mode: AgentMode;
  continuedFrom: string | null;
  taskId: string | null;
  taskRunId: string | null;
  createdAt: string;
  truncated?: true;
}

export interface WebhookAgentRunWaitingData {
  id: string;
  sessionId: string | null;
  state: "waiting";
  /** "agent": it asked for help; "user": someone took over; "captcha": a CAPTCHA needs a person. */
  by: "agent" | "user" | "captcha";
  /** At most 500 characters, with variables as their %name%. */
  reason: string | null;
  /** The run in the console (a login is needed). The signed live view is never sent: get it with sessions.live(). */
  consoleUrl: string;
  since: string;
}

export interface WebhookAgentRunResumedData {
  id: string;
  sessionId: string | null;
  state: "resumed";
  /** What it waited for, as in agent_run.waiting. */
  by: "agent" | "user" | "captcha";
  /** "handback": a person handed back; "message": a message answered its request for help; "solved": the CAPTCHA was solved. */
  via: "handback" | "message" | "solved";
  at: string;
}

export interface WebhookAgentRunFinishedData {
  id: string;
  status: "completed" | "failed" | "canceled";
  task: string;
  sessionId: string | null;
  provider: AgentProvider;
  model: string | null;
  result: unknown;
  resultText: string | null;
  structured: boolean;
  error: string | null;
  errorCode: string | null;
  continuable: { until: string } | null;
  continuedFrom: string | null;
  /** The names of the run's own variables (never values): continuing it needs their values again. */
  variableNames: string[];
  messages: number;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  taskId: string | null;
  taskRunId: string | null;
  createdAt: string;
  finishedAt: string | null;
  truncated?: true;
}

export interface WebhookCaptchaWaitingData {
  sessionId: string;
  kind: CaptchaKind;
  host: string;
  reason: string | null;
  since: string;
  captcha: CaptchaMode;
}

export interface WebhookCaptchaOutcomeData {
  sessionId: string;
  /** The agent run working in the session, if any. */
  runId: string | null;
  kind: CaptchaKind;
  host: string;
  /** "auto": automatic solving; "person": it cleared while it waited for a person. */
  by: "auto" | "person";
  ms: number;
  /** captcha.failed: why automatic solving failed. */
  reason?: string;
}

export interface WebhookCrawlFinishedData {
  id: string;
  status: "completed" | "failed" | "canceled";
  url: string;
  pagesDone: number;
  pagesFailed: number;
  skippedByRobots: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface WebhookTaskRunStartedData {
  taskId: string;
  taskName: string | null;
  taskRunId: string;
  runId: string;
  sessionId: string | null;
  status: "running";
  scheduled: boolean;
  scheduledFor: string | null;
  /** Names only, never values. */
  variables: string[];
  startedAt: string;
}

export interface WebhookTaskRunFinishedData {
  taskId: string;
  taskName: string | null;
  taskRunId: string;
  runId: string | null;
  status: "completed" | "failed" | "canceled";
  scheduled: boolean;
  scheduledFor: string | null;
  result: unknown;
  resultText: string | null;
  structured: boolean;
  error: string | null;
  errorCode: string | null;
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null };
  variables: string[];
  createdAt: string | null;
  finishedAt: string | null;
  truncated?: true;
}

export interface WebhookSchedulePausedData {
  taskId: string;
  taskName: string | null;
  /** "schedule_invalid": it could not be read; "schedule_ended": it has no more times. */
  reason: "schedule_invalid" | "schedule_ended";
  message: string;
  pausedAt: string;
}

export interface WebhookUsageLimitData {
  kind: "model_spend" | "proxy_gb" | "captcha_solves" | "searches" | "concurrency";
  /** The plan's limit: USD, GB, a count, or sessions at once. */
  limit: number;
  used: number;
  /** "2026-09" (a UTC month), or "2026-09-30T14" (a UTC hour) for concurrency. */
  period: string;
  /** When a monthly limit starts over; null for concurrency. */
  resetsAt: string | null;
}

export interface WebhookApiKeyData {
  id: string;
  /** The key's first 12 characters, as apiKeys.list shows. */
  prefix: string;
  name: string;
  by: WebhookActor;
}

export interface WebhookCredentialCodeNeededData {
  /** The password credential whose code or sign-in link is awaited. */
  credential: string;
  /** What the site sends: a 2FA code or a sign-in link. Forward it now with `credentials.pushCode`. */
  type: "code" | "link";
  sessionId: string;
  /** The agent run that waits; null for an action or `boxline-otp`. */
  runId: string | null;
}

export interface WebhookCredentialChangedData {
  /** The credential's name. */
  name: string;
  action: "created" | "updated" | "deleted";
  type: CredentialType;
  by: WebhookActor;
  /** Field names an update changed ("password", "origins", …; "profiles" when it was linked to or unlinked from a profile). */
  changed?: string[];
}

export interface WebhookChangedData {
  endpointId: string;
  host: string;
  action: "created" | "updated" | "deleted" | "secret_rotated";
  events: WebhookSubscription[];
  enabled: boolean;
  by: WebhookActor;
  changed?: ("url" | "events" | "enabled" | "description")[];
}

export interface WebhookDisabledData {
  endpointId: string;
  host: string;
  reason: "gone" | "failing";
  failingSince: string | null;
  disabledAt: string;
}

export interface WebhookExtensionData {
  id: string;
  name: string;
  version: string | null;
  sha256: string | null;
  by: WebhookActor;
}

/** Each event type's `data`. */
export interface WebhookEventDataMap {
  "session.started": WebhookSessionData;
  "session.expiring": WebhookSessionExpiringData;
  "session.ended": WebhookSessionData;
  "agent_run.started": WebhookAgentRunStartedData;
  "agent_run.waiting": WebhookAgentRunWaitingData;
  "agent_run.resumed": WebhookAgentRunResumedData;
  "agent_run.finished": WebhookAgentRunFinishedData;
  "captcha.waiting": WebhookCaptchaWaitingData;
  "captcha.solved": WebhookCaptchaOutcomeData;
  "captcha.failed": WebhookCaptchaOutcomeData & { reason: string };
  "crawl.finished": WebhookCrawlFinishedData;
  "task_run.started": WebhookTaskRunStartedData;
  "task_run.finished": WebhookTaskRunFinishedData;
  "task.schedule_paused": WebhookSchedulePausedData;
  "usage.limit_reached": WebhookUsageLimitData;
  "api_key.created": WebhookApiKeyData;
  "api_key.revoked": WebhookApiKeyData;
  "credential.code_needed": WebhookCredentialCodeNeededData;
  "credential.changed": WebhookCredentialChangedData;
  "webhook.changed": WebhookChangedData;
  "webhook.disabled": WebhookDisabledData;
  "extension.uploaded": WebhookExtensionData;
  "extension.deleted": WebhookExtensionData;
  "webhook.test": { endpointId: string; message: string };
}

/** A verified delivery as a union keyed by `type`: `verifyWebhook(…) as WebhookEventPayload`, then switch on `event.type`. */
export type WebhookEventPayload = {
  [K in keyof WebhookEventDataMap]: Omit<WebhookEvent<WebhookEventDataMap[K]>, "type"> & { type: K };
}[keyof WebhookEventDataMap];

// ---------------------------------------------------------------- credentials

/** A credential holds a website password (with an optional 2FA key) or a secret (one value). */
export type CredentialType = "password" | "secret";

/**
 * Where a credential may be used: "agent" (default): only the AI, as placeholders in agent runs, plain-English steps,
 * scripts' step() and the type action; "shell": only as environment variables in session shells and commands; "all": both.
 */
export type CredentialScope = "agent" | "shell" | "all";

/**
 * What `Session.typeCredential` types from a password credential: its user name, its password or its current 2FA code
 * (with a `codeSource` of "push" or "url" it waits for a fresh one, up to `codeTimeoutSeconds`).
 */
export type CredentialField = "username" | "password" | "otp";

/**
 * Where a password's 2FA codes come from: "totp" (an authenticator key, `totpSecret`), "push" (your system sends each
 * code or sign-in link the site emails or texts: `credentials.pushCode`) or "url" (the platform asks your endpoint
 * `codeUrl`, signed like a webhook). A password without one has no 2FA (`codeSource: null`).
 */
export type CredentialCodeSource = "totp" | "push" | "url";

interface CredentialBase {
  /** Also its placeholder (`%NAME%`, `%NAME.password%`) and its shell variable (`$NAME`, `$NAME_PASSWORD`). */
  name: string;
  description: string | null;
  /** The AI may use it in bash commands; this also allows exporting it into shells. */
  shell: boolean;
  scope: CredentialScope;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

/** A website password. Neither the password nor the 2FA key is ever returned. */
export interface PasswordCredential extends CredentialBase {
  type: "password";
  /** The sites where the AI may type it (1 to 20). */
  origins: string[];
  username: string;
  /** It has a 2FA key (`codeSource` is "totp"): `%NAME.otp%` and `boxline-otp NAME` give the current code. */
  hasTotp: boolean;
  /** Where its 2FA codes come from; null: no 2FA. */
  codeSource: CredentialCodeSource | null;
  /** The endpoint the platform asks for codes (`codeSource` "url"); null otherwise. Its signing secret is never shown again. */
  codeUrl: string | null;
  /** How long a wait for a pushed or asked code or link lasts (5 to 900 s, default 300). */
  codeTimeoutSeconds: number;
}

/** A secret (an API key, a token). Its value is never returned. */
export interface SecretCredential extends CredentialBase {
  type: "secret";
  /** Sites where the AI may type it (null = any site). */
  origins: string[] | null;
  /** "••••1a2b": the last 4 characters of values of 24 characters or more; null for shorter values and secrets with origins. */
  preview: string | null;
}

/** A credential without its values: `switch (c.type)` tells the two apart. */
export type Credential = PasswordCredential | SecretCredential;

/**
 * A credential as `credentials.create` and `credentials.update` return it: when `codeUrl` was set or changed it also
 * has `codeUrlSecret` (`whsec_…`), the key that signs the platform's requests to `codeUrl`, shown this once (a new one
 * any time with `credentials.rotateCodeUrlSecret`).
 */
export type CredentialWritten<C extends Credential = Credential> = C & { codeUrlSecret?: string };

interface CredentialCreateBase {
  /**
   * An environment variable name in capitals, [A-Z_][A-Z0-9_]*, at most 64 characters; not one the platform or bash
   * sets (PATH, HOME, PWD, IFS, …, or starting with BOXLINE_, SANDBOXD_ or BASH_). One per project, whatever the type.
   */
  name: string;
  /** Up to 500 characters. */
  description?: string;
  /** Let the AI use it in bash commands (and so export it into shells). Default false. */
  shell?: boolean;
  /** Default "agent". */
  scope?: CredentialScope;
}

/** A website password; needs the plan's `loginDetails`. */
export interface PasswordCredentialCreateParams extends CredentialCreateBase {
  type: "password";
  /** The sites where the AI may type it, `"https://shop.example.com"` or `"https://*.example.com"` (any subdomain); 1 to 20. */
  origins: string[];
  /** 1 to 320 characters. */
  username: string;
  /** 1 to 1024 characters. Sealed when stored and never returned. */
  password: string;
  /**
   * Where its 2FA codes come from: "totp" (with `totpSecret`; `totpSecret` alone means "totp"), "push" (send each code
   * or link with `credentials.pushCode`), "url" (with `codeUrl`), or left out / null for no 2FA.
   */
  codeSource?: CredentialCodeSource | null;
  /**
   * The site's 2FA setup key (base32, any case, spaces allowed) or an otpauth://totp/ link from its QR code (SHA1,
   * SHA256 or SHA512, 6 to 8 digits, a 15 to 120 s period; defaults SHA-1, 6 digits, 30 s). Only with "totp".
   */
  totpSecret?: string;
  /**
   * `codeSource` "url" (required then): a public HTTPS endpoint (never a private or internal address) the platform
   * asks with a signed POST every 5 s while a run waits for a code; the answer has `codeUrlSecret` once.
   */
  codeUrl?: string;
  /** How long a "push" or "url" wait lasts: 5 to 900 seconds, default 300. */
  codeTimeoutSeconds?: number;
}

/** A secret: one value. */
export interface SecretCredentialCreateParams extends CredentialCreateBase {
  type: "secret";
  /** 1 to 8000 characters, no NUL. Sealed when stored and never returned. */
  value: string;
  /** Sites where the AI may type it, e.g. ["https://example.com"] (1 to 20); without, any site. */
  origins?: string[];
}

export type CredentialCreateParams = PasswordCredentialCreateParams | SecretCredentialCreateParams;

/**
 * Changes to a password; what is not sent is kept. A change of `origins` that adds a site, or of `scope`/`shell` that
 * makes an AI-only password readable by shells, needs `password` again in the same call (and `totpSecret`, a new one or
 * null, when it has 2FA); so does a change of `codeSource` (removing 2FA included) or `codeUrl`.
 */
export interface PasswordCredentialUpdateParams {
  origins?: string[];
  username?: string;
  password?: string;
  /** Where the codes come from; null removes 2FA. Needs `password` again. */
  codeSource?: CredentialCodeSource | null;
  /** A new 2FA setup key or otpauth://totp/ link; null removes 2FA. */
  totpSecret?: string | null;
  /** The endpoint asked for codes ("url"). Needs `password` again; the answer has a new `codeUrlSecret`. */
  codeUrl?: string;
  /** 5 to 900 seconds. */
  codeTimeoutSeconds?: number;
  /** null clears it. */
  description?: string | null;
  shell?: boolean;
  scope?: CredentialScope;
  value?: never;
}

/**
 * Changes to a secret; what is not sent is kept. A change of `origins` that adds a site, or null, or of `scope`/`shell`
 * that makes an AI-only secret readable by shells, needs `value` again.
 */
export interface SecretCredentialUpdateParams {
  value?: string;
  /** null allows any site. */
  origins?: string[] | null;
  description?: string | null;
  shell?: boolean;
  scope?: CredentialScope;
  username?: never;
  password?: never;
  codeSource?: never;
  codeUrl?: never;
  codeTimeoutSeconds?: never;
  totpSecret?: never;
}

/** What credentials.update takes: the fields of a password or of a secret (the type cannot change). Changes apply to new uses. */
export type CredentialUpdateParams = PasswordCredentialUpdateParams | SecretCredentialUpdateParams;

/**
 * One entry of the credentials audit log: a change, or a use (once per session, command, agent run, step session,
 * script, task run, type action or boxline-otp session). Never values.
 */
export interface CredentialAuditEntry {
  at: string;
  /** "code": a pushed 2FA code or sign-in link (`details.kind`), never its value. */
  action: "create" | "update" | "delete" | "use" | "code";
  type: CredentialType;
  name: string;
  /** Who changed it: "user:<email>", "key:<api key id>", or "support" (Boxline support acting as a user). */
  actor: string | null;
  /** What used it: `id` is the session, or for `agent_run` the run and for `task_run` the task run. Null for changes. */
  usedBy: { type: "session" | "exec" | "agent_run" | "step" | "script" | "task_run" | "action" | "otp"; id: string } | null;
  details: Record<string, unknown>;
}

export interface CredentialAuditParams extends ListParams {
  /** One credential. */
  name?: string;
}

/** What `credentials.pushCode` sends: a 2FA code (1 to 64 characters, no spaces) or a sign-in link on one of the credential's sites. */
export type CredentialCodePush = { code: string; link?: never } | { link: string; code?: never };

/** What `credentials.pushCode` returns: the code or link is kept for a wait in progress (used once, at most 10 minutes). */
export interface CredentialCodeAccepted {
  accepted: true;
  kind: "code" | "link";
  expiresAt: string;
}

// ---------------------------------------------------------------- extensions

/** An uploaded Chrome extension (Manifest V3). */
export interface ExtensionInfo {
  id: string;
  /** From the manifest (resolved from _locales when it uses __MSG_…__). */
  name: string;
  version: string;
  description: string;
  permissions: string[];
  hostPermissions: string[];
  /** Size of the zip. */
  sizeBytes: number;
  files: number;
  /** Of the zip. */
  sha256: string;
  createdAt: string;
}
