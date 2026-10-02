import type { Boxline } from "./client.js";
import type { RequestOptions } from "./core.js";
import { CaptchaTimeoutError, makeError } from "./errors.js";
import type { PagePromise, Page } from "./pagination.js";
import type {
  Action,
  ActionItem,
  ActionResult,
  AgentProvider,
  CaptchaKind,
  ComputerAction,
  ComputerOptions,
  ComputerResult,
  DragTarget,
  ExecExit,
  ExecOptions,
  ExecResult,
  ExtractValue,
  FileList,
  FileRef,
  GotoResult,
  PageContent,
  PageElements,
  ProxyOption,
  Recording,
  RunScriptOptions,
  ScreenshotValue,
  ScriptResult,
  SessionData,
  SessionEvent,
  SessionEventsParams,
  SessionUrls,
  StepOptions,
  StepResult,
  TabList,
  UpdateSessionParams,
  VisitedPage,
  WaitUntil,
  ListParams,
  MouseButton,
  MoveTimings,
  Point,
} from "./types.js";

/** HTTP status an action result's code stands for, when one action of a list fails (the call itself answered 200). */
const ACTION_STATUS: Record<string, number> = { captcha_timeout: 409, model_refused: 422 };

export interface ClickOptions {
  button?: MouseButton;
  /** 2 = double click, 3 = triple click. */
  count?: 1 | 2 | 3;
  /** Keys held during the click, e.g. ["Shift"]. */
  modifiers?: string[];
}

/**
 * One session: a machine with a browser and/or a shell and a shared /workspace disk. `data` is the session as the
 * API last returned it; lifecycle calls (pause, update, extend, …) refresh it.
 */
export class Session {
  private declare readonly client: Boxline;
  public data: SessionData;

  constructor(client: Boxline, data: SessionData) {
    // Not enumerable: logging a session shows its data, never the client (and its API key).
    Object.defineProperty(this, "client", { value: client, enumerable: false });
    this.data = data;
  }

  get id() {
    return this.data.id;
  }
  get status() {
    return this.data.status;
  }
  /** WebSocket URL for Playwright/Puppeteer `connectOverCDP`. Treat it like a password. */
  get connectUrl() {
    return this.data.connectUrl;
  }
  get liveUrl() {
    return this.data.liveUrl;
  }
  get terminalUrl() {
    return this.data.terminalUrl;
  }
  get workspacePath() {
    return this.data.workspacePath;
  }

  private set(s: Session) {
    this.data = s.data;
    return this;
  }

  // ----- lifecycle

  async refresh(options?: RequestOptions) {
    return this.set(await this.client.sessions.get(this.id, options));
  }
  async release(options?: RequestOptions) {
    return this.set(await this.client.sessions.release(this.id, options));
  }
  /** Saves browser state and files, frees the machine and stops billing. Connecting again resumes it. */
  async pause(options?: RequestOptions) {
    return this.set(await this.client.sessions.pause(this.id, options));
  }
  async resume(options?: RequestOptions) {
    return this.set(await this.client.sessions.resume(this.id, options));
  }
  /**
   * Makes the current connectUrl, liveUrl and terminalUrl stop working (use it if one leaked) and closes
   * connections made with them; the session gets fresh URLs.
   */
  async rotateUrls(options?: RequestOptions) {
    return this.set(await this.client.sessions.rotateUrls(this.id, options));
  }
  /** Changes keepAlive, userMetadata, the proxy, the captcha option or the browser settings. */
  async update(patch: UpdateSessionParams, options?: RequestOptions) {
    return this.set(await this.client.sessions.update(this.id, patch, options));
  }
  /** Sets, changes or (null) removes the session's proxy; new connections use it right away. */
  async setProxy(proxy: ProxyOption | null, options?: RequestOptions) {
    return this.update({ proxy }, options);
  }
  /** A new IP for the session's proxy (sticky sessions keep one IP until this is called). */
  async rotateProxy(options?: RequestOptions) {
    return this.set(await this.client.sessions.rotateProxy(this.id, options));
  }
  /** Adds time (60–3600 s), up to the plan's maximum session length. */
  async extend(seconds: number, options?: RequestOptions) {
    return this.set(await this.client.sessions.extend(this.id, seconds, options));
  }
  /** Moves the live session to a fresh machine; reconnect to the same connectUrl afterwards. Returns the timings. */
  async move(options?: RequestOptions): Promise<MoveTimings> {
    const r = await this.client.sessions.move(this.id, options);
    this.data = r.session.data;
    return r.timings;
  }
  /** Fresh signed URLs (also stored on this object). */
  async live(options?: RequestOptions): Promise<SessionUrls> {
    const urls = await this.client.sessions.live(this.id, options);
    this.data = { ...this.data, ...urls };
    return urls;
  }

  /**
   * Waits until no CAPTCHA is waiting for a person (someone solved it in the live view, or the page moved on).
   * Throws CaptchaTimeoutError after `timeoutMs` (default 5 minutes).
   */
  async waitForHuman(opts: { timeoutMs?: number; intervalMs?: number } = {}) {
    const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
    for (;;) {
      await this.refresh();
      const a = this.data.attention;
      if (!a || this.data.status !== "RUNNING") return this;
      if (Date.now() > deadline) throw new CaptchaTimeoutError(408, "captcha_timeout", `nobody solved the CAPTCHA on ${a.url} in time`);
      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 1000));
    }
  }

  /**
   * Calls `handler` when a CAPTCHA starts waiting for a person ("detected") and when it is gone ("cleared").
   * Polls the session's events every `intervalMs` (default 2 s), starting after event number `after` (default 0:
   * challenges seen before you subscribed are reported too). It stops by itself when the session ends; the
   * returned function stops it sooner.
   */
  onCaptcha(
    handler: (e: { state: "detected" | "cleared"; kind: CaptchaKind; url: string; event: SessionEvent }) => void | Promise<void>,
    opts: { intervalMs?: number; after?: number } = {},
  ): () => void {
    let stopped = false;
    void (async () => {
      let after = opts.after ?? 0;
      for (let round = 1; !stopped; round++) {
        try {
          const page = await this.events({ types: ["captcha"], after });
          for (const event of page.data) {
            if (stopped) return;
            const d = (event.data ?? {}) as { state?: "detected" | "cleared"; kind?: CaptchaKind };
            if ((d.state === "detected" || d.state === "cleared") && d.kind) await handler({ state: d.state, kind: d.kind, url: event.url ?? "", event });
          }
          after = page.nextAfter;
          if (round % 5 === 0) await this.refresh(); // stop by itself once the session has ended
          if (this.data.status === "COMPLETED" || this.data.status === "ERROR") return;
        } catch {
          /* keep polling; the session may be moving */
        }
        await new Promise((r) => setTimeout(r, opts.intervalMs ?? 2000));
      }
    })();
    return () => {
      stopped = true;
    };
  }

  // ----- logs and recording

  /** Console, network, navigation, error, lifecycle, action, exec and captcha events (oldest first). */
  events(params: SessionEventsParams = {}, options?: RequestOptions): PagePromise<SessionEvent, Page<SessionEvent> & { nextAfter: number }> {
    return this.client.sessions.events(this.id, params, options);
  }
  /** Events as they happen (the backlog after `after` first). Stop with `break` or the signal. */
  streamEvents(params: { after?: number } = {}, options?: RequestOptions): AsyncGenerator<SessionEvent> {
    return this.client.sessions.streamEvents(this.id, params, options);
  }
  /** Pages visited in this session. */
  pages(params: ListParams = {}, options?: RequestOptions): PagePromise<VisitedPage> {
    return this.client.sessions.pages(this.id, params, options);
  }
  /** Replay frames (JPEG) kept while the session ran. */
  recording(options?: RequestOptions): Promise<Recording> {
    return this.client.sessions.recording(this.id, options);
  }
  /** One replay frame as JPEG bytes. */
  recordingFrame(index: number, options?: RequestOptions): Promise<Uint8Array> {
    return this.client.sessions.recordingFrame(this.id, index, options);
  }

  // ----- browser

  /** Runs actions next to the browser (one HTTP call for the whole list); a bare string is a plain-English step. */
  actions(actions: ActionItem[] | ActionItem, opts: { timeoutMs?: number } = {}, options?: RequestOptions): Promise<ActionResult[]> {
    return this.client.sessions.actions(this.id, actions, opts, options);
  }
  private async one<T>(action: Action, options?: RequestOptions): Promise<T> {
    const [r] = await this.actions(action, {}, options);
    if (!r?.ok) {
      const code = r?.code ?? "action_failed";
      throw makeError(ACTION_STATUS[code] ?? 400, code, r?.error ?? "action failed");
    }
    return r.value as T;
  }
  /**
   * Runs one plain-English step ("click Sign in", "type %email% into the email field"). `secrets: ["NAME"]` lets it use
   * project secrets as %NAME%, each on its own sites (see StepOptions).
   */
  step(instruction: string, opts: StepOptions = {}, options?: RequestOptions) {
    return this.one<StepResult>({ action: "step", instruction, ...opts }, options);
  }
  /** Structured data from the current page. */
  extract<T = unknown>(instruction: string, opts: { schema?: Record<string, unknown>; provider?: AgentProvider; model?: string } = {}, options?: RequestOptions) {
    return this.one<ExtractValue<T>>({ action: "extract", instruction, ...opts }, options);
  }
  goto(url: string, opts: { waitUntil?: WaitUntil } = {}, options?: RequestOptions) {
    return this.one<GotoResult>({ action: "goto", url, ...opts }, options);
  }
  /** Clicks an element (CSS selector) or a point ({x, y}); `count: 2` double-clicks, `button: "right"` right-clicks. */
  click(target: string | Point, opts: ClickOptions = {}, options?: RequestOptions) {
    return this.one<null>(typeof target === "string" ? { action: "click", selector: target, ...opts } : { action: "click", x: target.x, y: target.y, ...opts }, options);
  }
  /** Moves the pointer over an element (CSS selector) or to a point. */
  hover(target: string | Point, options?: RequestOptions) {
    return this.one<null>(typeof target === "string" ? { action: "hover", selector: target } : { action: "hover", x: target.x, y: target.y }, options);
  }
  /** Where the pointer is on this tab (where the API last moved it; 0, 0 before any move). */
  cursor(options?: RequestOptions) {
    return this.one<Point>({ action: "cursor" }, options);
  }
  fill(selector: string, value: string, options?: RequestOptions) {
    return this.one<null>({ action: "fill", selector, value }, options);
  }
  /** Types text with the keyboard (into `selector` if given). */
  type(text: string, opts: { selector?: string; delayMs?: number } = {}, options?: RequestOptions) {
    return this.one<null>({ action: "type", text, ...opts }, options);
  }
  press(key: string, options?: RequestOptions) {
    return this.one<null>({ action: "press", key }, options);
  }
  /** Turns the wheel by `deltaY` pixels (and `deltaX`), over x/y when given. */
  scroll(deltaY: number, at: { x?: number; y?: number; deltaX?: number; modifiers?: string[] } = {}, options?: RequestOptions) {
    return this.one<null>({ action: "scroll", deltaY, ...at }, options);
  }
  /** Waits for a selector, or a number of milliseconds. */
  wait(target: string | number, options?: RequestOptions) {
    return this.one<null>(typeof target === "number" ? { action: "wait", ms: target } : { action: "wait", selector: target }, options);
  }
  /** Picks an option of a select element by its label or value. */
  select(selector: string, option: string, options?: RequestOptions) {
    return this.one<null>({ action: "select", selector, option }, options);
  }
  /** The page as a model sees it: title, URL, visible text and numbered interactive elements. */
  elements(options?: RequestOptions) {
    return this.one<PageElements>({ action: "elements" }, options);
  }
  evaluate<T = unknown>(expression: string, options?: RequestOptions) {
    return this.one<T>({ action: "evaluate", expression }, options);
  }
  content(format: "markdown" | "html" | "text" = "markdown", options?: RequestOptions) {
    return this.one<PageContent>({ action: "content", format }, options);
  }
  /**
   * A screenshot of the current tab: `{data (base64), mimeType}`. `maxWidth` scales it down and `cursor` draws the
   * pointer (then also `width`, `height`, `scale`).
   */
  screenshot(opts: { fullPage?: boolean; format?: "png" | "jpeg"; quality?: number; maxWidth?: number; cursor?: boolean } = {}, options?: RequestOptions) {
    return this.one<ScreenshotValue>({ action: "screenshot", ...opts }, options);
  }
  /** Sets a file input to a file in the workspace (e.g. one written with files.write). */
  upload(selector: string, path: string, options?: RequestOptions) {
    return this.one<null>({ action: "upload", selector, path }, options);
  }
  tabs(options?: RequestOptions) {
    return this.one<TabList>({ action: "tabs" }, options);
  }
  newTab(url?: string, options?: RequestOptions) {
    return this.one<{ index: number }>({ action: "newTab", url }, options);
  }
  switchTab(index: number, options?: RequestOptions) {
    return this.one<null>({ action: "switchTab", index }, options);
  }
  closeTab(index?: number, options?: RequestOptions) {
    return this.one<null>({ action: "closeTab", index }, options);
  }
  back(options?: RequestOptions) {
    return this.one<{ url: string }>({ action: "back" }, options);
  }
  forward(options?: RequestOptions) {
    return this.one<{ url: string }>({ action: "forward" }, options);
  }
  reload(options?: RequestOptions) {
    return this.one<{ url: string }>({ action: "reload" }, options);
  }
  /**
   * The mouse, in viewport CSS pixels (the session's viewport, 1280×720 by default). Straight lines only: `steps`
   * spreads a move over that many evenly spaced points. It acts on the page, never on the machine's desktop.
   */
  readonly mouse = {
    move: (x: number, y: number, opts: { steps?: number } = {}, options?: RequestOptions) => this.one<Point>({ action: "move", x, y, ...opts }, options),
    /** Moves by dx/dy from where the pointer is. */
    moveBy: (dx: number, dy: number, opts: { steps?: number } = {}, options?: RequestOptions) => this.one<Point>({ action: "move", dx, dy, ...opts }, options),
    click: (x: number, y: number, opts: ClickOptions = {}, options?: RequestOptions) => this.one<null>({ action: "click", x, y, ...opts }, options),
    down: (opts: { button?: MouseButton } = {}, options?: RequestOptions) => this.one<null>({ action: "mouse_down", ...opts }, options),
    up: (opts: { button?: MouseButton } = {}, options?: RequestOptions) => this.one<null>({ action: "mouse_up", ...opts }, options),
    /**
     * Presses at `from`, moves to `to` (in `steps` points, default 10) and releases; each end is a point or a selector.
     * Or pass a path of 2–200 points to follow.
     */
    drag: (fromOrPath: DragTarget | Point[], to?: DragTarget | DragOptions, opts: DragOptions = {}, options?: RequestOptions) => {
      if (Array.isArray(fromOrPath)) return this.one<{ from: Point; to: Point }>({ action: "drag", path: fromOrPath, ...((to ?? {}) as DragOptions) }, options);
      return this.one<{ from: Point; to: Point }>({ action: "drag", from: fromOrPath, to: to as DragTarget, ...opts }, options);
    },
  };

  /** The keyboard. Key names are Playwright's (Enter, Tab, ArrowLeft, Control, Shift, Meta…); ctrl, cmd, Return work too. */
  readonly keyboard = {
    /** A combination held together, "Control+A" or ["Control", "A"]; several separated by spaces run one after the other. */
    key: (keys: string | string[], opts: { holdMs?: number } = {}, options?: RequestOptions) => this.one<null>({ action: "key", keys, ...opts }, options),
    type: (text: string, opts: { delayMs?: number } = {}, options?: RequestOptions) => this.one<null>({ action: "type", text, ...opts }, options),
    press: (key: string, options?: RequestOptions) => this.one<null>({ action: "press", key }, options),
  };

  /**
   * Runs ONE computer-use action as the model's tool gave it (Anthropic `computer` input, or one OpenAI
   * `computer_call` action) and returns the screen after it (see Sessions.computer).
   */
  computer(action: ComputerAction, opts: ComputerOptions = {}, options?: RequestOptions): Promise<ComputerResult> {
    return this.client.sessions.computer(this.id, action, opts, options);
  }

  /** Writes the browser's cookies as a Netscape cookie file inside the workspace, for curl -b / wget. */
  exportCookies(path?: string, options?: RequestOptions) {
    return this.client.sessions.exportCookies(this.id, path, options);
  }
  /** @deprecated Use session.exportCookies(). */
  readonly browser = {
    exportCookies: (path?: string, options?: RequestOptions) => this.exportCookies(path, options),
  };

  // ----- shell

  /** Runs a shell command (persistent bash by default: cd/export survive between calls). */
  exec(command: string, opts: ExecOptions = {}, options?: RequestOptions): Promise<ExecResult> {
    return this.client.sessions.exec(this.id, command, opts, options);
  }
  /** Runs a command and streams its output. Aborting `signal` stops the command. */
  execStream(command: string, onData: (stream: "stdout" | "stderr", data: string) => void, opts: ExecOptions & { signal?: AbortSignal } = {}, options?: RequestOptions): Promise<ExecExit> {
    return this.client.sessions.execStream(this.id, command, onData, opts, options);
  }
  /**
   * Runs Playwright code inside the session (needs a shell). `page`, `context`, `browser`, `env`, and the AI helpers
   * `step()`, `extract()` and `useModel(model)` / `useModel(provider, model)` are in scope; top-level await works. A
   * step or extract uses the call's own `{provider, model}`, else the last `useModel()`, else `ai`, else the default.
   */
  runScript(code: string, opts: RunScriptOptions = {}, options?: RequestOptions): Promise<ScriptResult> {
    return this.client.sessions.runScript(this.id, code, opts, options);
  }
  /** Restarts the persistent shell (or the named one). */
  restartShell(name?: string, options?: RequestOptions): Promise<void> {
    return this.client.sessions.restartShell(this.id, name, options);
  }
  /** @deprecated Use session.restartShell(). */
  readonly shell = {
    restart: (name?: string, options?: RequestOptions) => this.restartShell(name, options),
  };

  // ----- files in /workspace

  readonly files = {
    list: (path = ".", options?: RequestOptions): Promise<FileList> => this.client.sessions.files.list(this.id, path, options),
    read: (path: string, options?: RequestOptions): Promise<Uint8Array> => this.client.sessions.files.read(this.id, path, options),
    readText: (path: string, options?: RequestOptions): Promise<string> => this.client.sessions.files.readText(this.id, path, options),
    write: (path: string, data: string | Uint8Array | Blob, options?: RequestOptions): Promise<FileRef> => this.client.sessions.files.write(this.id, path, data, options),
    delete: (path: string, options?: RequestOptions): Promise<void> => this.client.sessions.files.delete(this.id, path, options),
    /** Waits for a file matching a glob (e.g. `downloads/*.csv`) that has finished writing. */
    waitFor: (pattern: string, timeoutMs = 30_000, options?: RequestOptions): Promise<FileRef> => this.client.sessions.files.waitFor(this.id, pattern, timeoutMs, options),
  };

  toJSON() {
    return this.data;
  }
}

export interface DragOptions {
  /** Points per move (from/to: default 10; a path: per segment, default 1). */
  steps?: number;
  button?: MouseButton;
  modifiers?: string[];
}
