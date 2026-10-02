# Boxline Node SDK

**Give your AI agents the infrastructure they need: browsers, shells, storage and isolated machines.**

Each session is an isolated machine with a real Chrome and, if you
ask for it, a bash shell with Python and Node, sharing one `/workspace` disk.

```bash
npm install @boxline/sdk            # add playwright-core (or playwright) to drive the browser with Playwright
export BOXLINE_API_KEY=bxl_...
```

The client talks to `https://api.boxline.dev`; set `BOXLINE_API_URL` (or `baseUrl`) for another API, e.g.
`http://localhost:8080` for a local one.

Node 18 or newer (it uses the global `fetch`). The client also works in browsers, with `credentials: "include"`
instead of an API key, on the platform's own sites.

- [Sessions and Playwright](#sessions-and-playwright)
- [Browser, shell and files together](#browser-shell-and-files-together)
- [The page APIs](#the-page-apis)
- [Web search](#web-search)
- [Mouse, keyboard and computer use](#mouse-keyboard-and-computer-use)
- [An agent run with variables](#an-agent-run-with-variables)
- [Limits, Continue and messages](#limits-continue-and-messages)
- [Tasks and structured output](#tasks-and-structured-output)
- [Secrets and saved login details](#secrets-and-saved-login-details)
- [A script with useModel](#a-script-with-usemodel)
- [CAPTCHAs](#captchas)
- [Browser settings and extensions](#browser-settings-and-extensions)
- [Webhooks](#webhooks)
- [Lists and pages](#lists-and-pages)
- [Errors, retries and time limits](#errors-retries-and-time-limits)
- [Every method](#every-method)
- [Examples](#examples)

## Sessions and Playwright

```ts
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const bx = new Boxline(); // BOXLINE_API_KEY; BOXLINE_API_URL (default https://api.boxline.dev)
const session = await bx.sessions.create({ timeout: 300 });

const browser = await chromium.connectOverCDP(session.connectUrl!); // a signed URL: treat it like a password
const page = browser.contexts()[0]!.pages()[0]!;
await page.goto("https://example.com");
console.log(await page.title());

// The actions API drives the same browser without Playwright, one HTTP call per list of actions.
const { title, content } = await session.content("markdown");
await session.release();
```

`session.liveUrl` is a page where a person can watch and take over. `session.pause()` saves the browser and files and
stops billing; touching the session resumes it.

## Browser, shell and files together

One session has a browser, a shell and a disk they share: browser downloads land in `<workspace>/downloads`, the shell
starts in the workspace, and the files API reads and writes it.

```ts
const s = await bx.sessions.create({ shell: true });
const browser = await chromium.connectOverCDP(s.connectUrl!);
const page = browser.contexts()[0]!.pages()[0]!;
await page.goto("http://127.0.0.1:4800");
await page.click("#download");                                   // the browser downloads a CSV

const file = await s.files.waitFor("downloads/*.csv");           // files: wait until it has finished writing
const r = await s.exec(`mkdir -p output && python3 - <<'EOF'
import csv
total = sum(float(row["revenue"]) for row in csv.DictReader(open("downloads/report.csv")))
open("output/total.txt", "w").write(f"{total:.2f}")
EOF`);                                                           // the shell: Python adds up a column
const total = (await s.files.readText("output/total.txt")).trim(); // files: read what the shell wrote

await s.actions([{ action: "fill", selector: "#total", value: total }, { action: "click", selector: "#send" }]);
await s.release();
```

The same mix works inside an agent run (`shell: true`: the agent uses `browser_*` tools and `bash`) and inside a
script (`require("child_process")` and `require("fs")` next to `page` and `step()`): see
[agent-mixed.ts](examples/agent-mixed.ts) and [script-mixed.ts](examples/script-mixed.ts).

## The page APIs

One call each; the page renders in a real browser inside a sandbox.

```ts
const page = await bx.fetch("https://example.com", { format: "markdown", links: true });
const png = await bx.screenshot("https://example.com", { fullPage: true });   // Uint8Array
const pdf = await bx.pdf("https://example.com", { paper: "A4" });
const { data } = await bx.extract<{ plans: { name: string; price: string }[] }>({
  url: "https://example.com/pricing",
  schema: { type: "object", properties: { plans: { type: "array", items: { type: "object", properties: { name: { type: "string" }, price: { type: "string" } } } } } },
});
const job = await bx.crawl.wait((await bx.crawl.start({ url: "https://example.com/docs", maxPages: 20 })).id);
```

A page that cannot load throws `PageUnreachableError` (502 `page_unreachable`) or `PageTimeoutError` (504
`page_timeout`).

## Web search

```ts
const { results, cached } = await bx.search({ query: "playwright connectOverCDP", limit: 5, country: "US", recency: "year" });
for (const r of results) console.log(r.title, r.url, r.publishedAt ?? "");

// fetch: also open the top pages (true = 3, or 0–5) in a sandboxed browser and get them as Markdown.
const withPages = await bx.search({ query: "boxline docs", limit: 3, fetch: 2 });
console.log(withPages.results[0].content?.slice(0, 200), withPages.results[0].error);
```

The same search by the same project within an hour comes from the cache (`cached: true`) and is not counted; the plan
includes `searchesPerMonth` (`bx.usage()` shows `searches`). The query text goes to the search provider (Brave) with the
platform's key, nothing about you: keep passwords and personal data out of it. `SearchUnavailableError` (503
`search_unavailable`) when search is not set up on the server.

## Mouse, keyboard and computer use

Coordinates are CSS pixels of the session's viewport (1280×720 by default). Everything acts on the page through the
browser, never on the machine's desktop, and moves in straight lines (`steps` spreads a move over evenly spaced points).

```ts
await s.mouse.move(400, 300, { steps: 10 });
await s.mouse.click(400, 300, { button: "right", count: 2, modifiers: ["Shift"] });
await s.mouse.drag("#card", "#done-column", { steps: 20 });       // selectors mean the element's centre
await s.mouse.drag([{ x: 100, y: 100 }, { x: 200, y: 150 }, { x: 300, y: 100 }]); // or a path
await s.mouse.down(); await s.mouse.up();
await s.hover("#menu");
await s.keyboard.key("ControlOrMeta+A");                            // Playwright's key names; ctrl, cmd, Return work too
console.log(await s.cursor());                                      // {x, y}
const shot = await s.screenshot({ maxWidth: 640, cursor: true });   // {data, mimeType, width, height, scale}

// Every result says what happened; a bare string is a plain-English step.
const results = await s.actions([{ action: "goto", url: "https://example.com" }, "click More information"]);
console.log(results.map((r) => r.text));
```

**Computer use.** `session.computer()` runs ONE action exactly as a computer-use model's tool gave it (Claude's
`computer` tool input, or one OpenAI `computer_call` action) and returns the screen after it, so you can drive a
session from your own computer-use loop:

```ts
const screen = await s.computer({ action: "left_click", coordinate: [512, 300] }, { maxWidth: 1024 }); // Anthropic shape
await s.computer({ type: "keypress", keys: ["CTRL", "A"] }, { screenshot: false });                     // OpenAI shape
// screen: {ok, text, screenshot (base64), width, height, scale, cursor, url, title}; send screen.screenshot back to the model
```

With `maxWidth` the screenshot is scaled down and the action's coordinates are read in its pixels: use the same
`maxWidth` on every call. A point outside the screen throws `OutOfViewportError`. Or let the agent do it:
`bx.agent.run({ task, mode: "computer" })` (models with `supportsComputerUse` in `bx.agent.models()`); its steps carry the
model's `thought`, also streamed as `thought` events.

## An agent run with variables

The model sees `%email%` and `%password%`, never the values. A value is typed only where the model types text or
picks an option, and `origins` limits it to fields on those sites (recommended for passwords).

```ts
const run = await bx.agent.run({
  task: "Sign in to https://example.com with %email% and %password%, then open the billing page.",
  variables: {
    email: "ada@example.com",
    password: { value: process.env.SITE_PASSWORD!, origins: ["https://example.com"] },
  },
});
for await (const event of bx.agent.stream(run.id)) {
  if (event.type === "tool") console.log(event.name, event.input); // placeholders, never values
  if (event.type === "done") console.log(event.status, event.result);
}
```

`agent.takeover(id)` and `agent.handBack(id, note)` hand the browser to a person and back; `agent.wait(id)` polls
until the run ends.

## Limits, Continue and messages

A run stops at the first of its limits: `maxSteps` (default 30; `null` for none), `maxCostUsd` (optional, model cost
in USD), `maxConsecutiveErrors` tool errors in a row (default 5), the same call with the same result 5 times, or its
session's time (`timeout`, for the run's own session). At a step, cost, error or no-progress limit it ends with an
`errorCode` (`max_steps`, `max_cost`, `too_many_errors`, `no_progress`), `resultText` says what is done and what is
left, and `continuable.until` says how long it can be continued: its session is kept for 10 minutes.

```ts
const run = await bx.agent.run({ task: "Turn every video in the workspace into 30-second clips", shell: true, maxSteps: 20, maxCostUsd: 2 });
let done = await bx.agent.wait(run.id);
if (done.continuable) {
  console.log(done.resultText); // what is done, what is left
  const next = await bx.agent.continueRun(done.id, { maxSteps: 30, instruction: "The downloads are done; do the clips." });
  done = await bx.agent.wait(next.id); // next.continuedFrom === done.id, same session
}
```

A run that had `variables` needs them again on `continueRun` (their values are never stored). `NotContinuableError`:
the run did not stop at a limit, was continued already, or its window passed.

Tell a working run something without taking the browser: it reads the message at its next step, and a run waiting for
your help (`ask_user_for_help`) takes it as the answer.

```ts
await bx.agent.sendMessage(run.id, "Also open page C and include its heading in the answer.");
```

## Tasks and structured output

A task is a saved agent run: an instruction with `%name%` variables, an output schema, browser settings, a saved login,
a model and, if you like, a schedule. Run it by hand or on its schedule; every run is an agent run.

```ts
interface Books { category: string; books: { title: string; price: number }[] }

const task = await bx.tasks.create({
  name: "Books by category",
  instruction: "Open https://books.toscrape.com, open the category %category% and return the first 3 books with their prices",
  variables: [{ name: "category", default: "Travel" }],
  output: {
    type: "object",
    properties: {
      category: { type: "string" },
      books: { type: "array", items: { type: "object", properties: { title: { type: "string" }, price: { type: "number" } }, required: ["title", "price"] } },
    },
    required: ["category", "books"],
  },
  schedule: { cron: "0 9 * * MON-FRI", timezone: "Europe/London", enabled: false },
});

const run = await bx.tasks.run<Books>(task.id, { variables: { category: "Poetry" } });
const done = await bx.tasks.waitForRun(run);                  // done.result: Books | null
console.log(done.status, done.result?.books, done.resultText);

for await (const r of bx.tasks.runs(task.id, { status: ["failed", "missed"] })) console.log(r.id, r.errorCode ?? r.reason);
await bx.tasks.update(task.id, { schedule: { enabled: true } });  // null removes a field, e.g. { schedule: null }
```

- **Structured output** works on one agent run too: `bx.agent.run({ task, output: schema })`, then
  `bx.agent.wait<T>(id)`. `result` is the JSON answer and `resultText` a one-sentence summary. An answer that still
  does not match after one repair try fails the run with `errorCode: "output_invalid"` (`ErrorCode.outputInvalid`).
- **Variables**: plain ones are written into the instruction (and kept with the run); `{ name, secret: true, origins }`
  is never stored, must come with every run, and is typed without the model seeing it. A task with a secret variable
  cannot have a schedule. A run missing a value throws `MissingVariablesError`.
- **Schedules**: five-field cron (at most every 5 minutes) read in `timezone`. A scheduled run is `queued` until it
  starts; a time that comes while a run is still going is `skipped`, and times the platform was down for are `missed`
  (`reason`, `missedCount`). The plan limits tasks and schedules switched on (`PlanLimitError`).
- `waitForRun` takes the run from `run()` or `(taskId, taskRunId)`, with `{pollMs, timeoutMs}`; there is no GET for
  one task run, so it watches the task's unfinished runs.

## Secrets and saved login details

Project secrets are write-only: the value is sealed when stored and never returned or shown. Each secret's `scope` says
where it may be used: `"agent"` (the default: only the AI, as `%NAME%`), `"shell"` (only as `$NAME` in shells) or `"all"`.

```ts
await bx.secrets.create({ name: "GITHUB_TOKEN", value: process.env.GITHUB_TOKEN!, scope: "shell" });
await bx.secrets.create({ name: "SITE_PASSWORD", value: process.env.SITE_PASSWORD!, origins: ["https://example.com"] });

// In a shell: exported as $GITHUB_TOKEN, and shown as %GITHUB_TOKEN% wherever it appears in the output.
const s = await bx.sessions.create({ shell: true, env: { REGION: "eu" }, secrets: ["GITHUB_TOKEN"] });
await s.exec("gh repo list --limit 3");
await s.exec("./deploy.sh", { secrets: ["DEPLOY_KEY"] });                 // this one command only

// For the AI: typed as %SITE_PASSWORD% only on its sites, never shown to the model.
await s.step("type %SITE_PASSWORD% into the password field", { secrets: ["SITE_PASSWORD"] });
await bx.agent.run({ task: "Sign in to https://example.com with %SITE_PASSWORD%", secrets: ["SITE_PASSWORD"] });

// A saved login's details with 2FA: %login.username%, %login.password% and %login.otp% in sessions started with it.
await bx.contexts.setLogin(context.id, { origin: "https://example.com", username: "ada@example.com", password, totpSecret });

for await (const e of bx.secrets.audit({ name: "GITHUB_TOKEN" })) console.log(e.at, e.action, e.actor, e.usedBy?.type);
```

- **Exported secrets can be read by anything that runs in the shell**, including an agent's commands that a web page
  tries to steer. Export only what you accept that for; keep passwords at scope `"agent"` with `origins`. Hiding
  values in output is a guard against accidents, not a boundary.
- `runScript(code, { secrets, login: true })` lets the script's `step()` calls use secrets and the saved login's
  details (the values never enter the machine). In a session with Chrome extensions, steps and scripts with secrets
  need `allowWithExtensions: true`, as agent runs with variables do.
- Errors: `SecretExistsError` (use `update`), `SecretNotAllowedError` (the scope does not allow that use),
  `TooManySecretValuesError` (the session hides as many values as it can: start a new one), `MachineTooOldError`
  (during a deploy), `PlanLimitError` (beyond the plan's `maxSecrets`).

## A script with useModel

`runScript` runs Playwright code inside the session (it needs `shell: true`). `page`, `context`, `browser`, `env`,
`require`, and the plain-English helpers `step()`, `extract()` and `useModel()` are in scope.

```ts
const s = await bx.sessions.create({ shell: true });
const { stdout, exitCode } = await s.runScript(`
  useModel("claude-haiku-4-5");                  // every later step() and extract() uses it
  await page.goto("https://example.com/signup");
  await step("type %email% into the email field");
  await step("click Continue", { model: "claude-sonnet-5" }); // this call only
  const plans = await extract("the plan names and prices");   // returns the data itself
  console.log(JSON.stringify(plans));
`, { env: { email: "ada@example.com" }, onData: (_stream, text) => process.stdout.write(text) });
```

## CAPTCHAs

By default (`captcha: "ask"`) the platform notices a CAPTCHA that waits for a person and hands over: agent runs and
steps pause, `session.data.attention` says which one, and a person solves it in the live view. `"ignore"` carries on;
`"solve"` (paid plans) tries to solve it first. Only automate sites you are allowed to.

```ts
const s = await bx.sessions.create({ captcha: "ask" });
const stop = s.onCaptcha(({ state, kind, url }) => console.log(`CAPTCHA ${state}: ${kind} on ${url}`)); // tell someone: s.liveUrl
await s.goto("https://example.com/signup");
await s.waitForHuman({ timeoutMs: 5 * 60_000 }); // throws CaptchaTimeoutError if nobody solves it
stop();
```

A plain-English step that waits too long throws `CaptchaTimeoutError` (409 `captcha_timeout`).

## Browser settings and extensions

Ad and tracker blocking and cookie-banner answers are on every plan; set them when a session starts, or change them
while it runs:

```ts
const s = await bx.sessions.create({ blockAds: true, cookieBanners: "reject" }); // "reject" is the default; "off" leaves banners alone
await s.goto("https://example.com");
await s.refresh();
console.log(s.data.blockedRequests); // refused inside the machine, before any proxy (collected about every 30 s)
await s.update({ blockAds: false, cookieBanners: "off" });
await bx.fetch("https://example.com", { blockAds: true }); // screenshot, pdf, extract, crawl.start and agent.run take it too
```

Chrome extensions (Manifest V3, plan feature `extensions`): upload the zip of the extension's folder once, then start
sessions with it (at most 10, at start only).

```ts
const ext = await bx.extensions.upload("./my-extension.zip"); // or a Uint8Array / Buffer / ArrayBuffer / Blob, at most 10 MB
const s = await bx.sessions.create({ extensions: [ext.id] }); // loaded before the session is returned
for await (const e of bx.extensions.list()) console.log(e.id, e.name, e.version, e.permissions);
await bx.extensions.delete(ext.id);
```

- **An extension sees every page and every value typed in the session** (agent variables such as passwords too),
  and can send them anywhere. Upload only extensions you trust, and keep secrets in sessions without extensions. An
  agent run with `variables` in a session with extensions throws `VariablesWithExtensionsError` unless you pass
  `allowWithExtensions: true`.
- The upload is checked before it is stored: `InvalidExtensionError` says why (not a zip, Manifest V2, a native
  binary, a `debugger` or `nativeMessaging` permission…), `PayloadTooLargeError` over 10 MB, `LimitReachedError`
  beyond 100 extensions, `ExtensionDeniedError` for one the operator blocks. Uploads carry an `Idempotency-Key`, so a
  retry never stores one twice.

## Webhooks

Signed HTTPS callbacks when a session ends, an agent run, task run or crawl finishes, or a CAPTCHA waits for a person.

```ts
const endpoint = await bx.webhooks.create({ url: "https://example.com/webhooks/boxline", events: ["session.ended", "agent_run.finished"] });
// endpoint.secret ("whsec_…") is shown only now: store it with your other secrets.
```

In your receiver, verify every delivery against the **raw** body, and drop events you have handled already (a
delivery can arrive more than once):

```ts
import { verifyWebhook, WebhookSignatureError } from "@boxline/sdk";

// body: the raw bytes (Buffer) exactly as received; re-serialised JSON will not match.
try {
  const event = verifyWebhook(body, req.headers["boxline-signature"], process.env.BOXLINE_WEBHOOK_SECRET!);
  if (!(await alreadyHandled(event.id))) await handle(event); // dedupe by the id in the signed body
  res.writeHead(200).end();
} catch (err) {
  if (err instanceof WebhookSignatureError) res.writeHead(400).end(err.reason); // malformed, timestamp_out_of_range, no_matching_signature
  else throw err;
}
```

- The signature's timestamp must be within 5 minutes of your clock (`{toleranceSeconds}` changes it), which stops
  replays of old deliveries.
- `bx.webhooks.rotateSecret(id)` returns a new secret; for 24 hours deliveries are signed with both, so switch at your
  pace. `verifyWebhook` takes a list too: `[newSecret, oldSecret]`.
- `bx.webhooks.test(id)` sends a `webhook.test` event now; `bx.webhooks.test(id, {type: "agent_run.waiting"})` sends a
  made-up sample of that type (marked `test: true`). `bx.webhooks.deliveries(id, {status: "failed"})` lists
  deliveries (newest first) with each attempt's status and `errorCode`; `retryDelivery(id, deliveryId)` sends one again.
- `bx.webhooks.eventTypes()` lists every event type with a description; `events: ["*"]` subscribes to all of them,
  also types added later, so ignore types you do not know. `verifyWebhook<WebhookEventPayload>(…)` types the event as
  a union keyed by `type`: `if (event.type === "agent_run.waiting") event.data.consoleUrl`.
- `webhookSignatureHeader(secret, body)` signs a body the way the API does, for your receiver's tests.
- Endpoints must be public HTTPS (`WebhookUrlNotAllowedError`); a plan has `webhookEndpoints` of them.

## Lists and pages

Every list takes `limit` and `after`. Await it for one page, or iterate it for everything (the SDK follows `next`):

```ts
const page = await bx.sessions.list({ status: ["RUNNING", "PAUSED"], limit: 50 });
console.log(page.data.length, page.total, page.next);

for await (const s of bx.sessions.list({ status: "RUNNING" })) console.log(s.id);
for await (const e of session.events({ types: ["console", "error"] })) console.log(e.text);
for await (const p of page.iterPages()) console.log(p.data.length);
```

Lists: `sessions.list`, `sessions.events`, `sessions.pages`, `contexts.list`, `apiKeys.list`, `agent.list`,
`crawl.list`, `extensions.list`, `tasks.list`, `tasks.runs`, `secrets.list`, `secrets.audit`, and a crawl's pages (`crawl.get(id, {after})`, or
`for await (const p of bx.crawl.pages(id))`).

## Errors, retries and time limits

- **Typed errors.** Every failure is a `BoxlineError` with `status`, `code` (stable, snake_case), `message`,
  `requestId` (the API's id: quote it when asking for support) and `clientRequestId` (yours, if you sent one).
  Subclasses: `RateLimitError` (`retryAfter`), `FeatureNotInPlanError`, `ProjectSuspendedError`,
  `IdempotencyMismatchError`, `IdempotencyInProgressError`, `InvalidCursorError`, `CaptchaTimeoutError`,
  `PageUnreachableError`, `PageTimeoutError`, `ModelRefusedError` (extract), `SearchUnavailableError`,
  `OutOfViewportError`, `WebhookUrlNotAllowedError`, `WebhooksUnavailableError`, `WebhookDisabledError`,
  `PayloadExpiredError`, `WebhookSignatureError` (from verifyWebhook), `VariablesWithExtensionsError`,
  `InvalidExtensionError`, `PayloadTooLargeError`, `LimitReachedError`, `ExtensionDeniedError`, `CrossSiteRequestError`,
  `MissingVariablesError`, `PlanLimitError`, `SecretExistsError`, `SecretNotAllowedError`, `TooManySecretValuesError`,
  `MachineTooOldError`, `NotContinuableError`, `TooManyMessagesError`, `SessionNotRunningError`, `AuthenticationError`,
  `NotFoundError`, and
  `BoxlineConnectionError` /
  `BoxlineTimeoutError` when no answer came back. `ErrorCode` has the codes.
- **Retries.** GETs, and the calls that create or start something (sessions, bulk, agent runs, continued runs, messages
  to runs, crawls, API keys, contexts, extension uploads, tasks, task runs), are retried after a network error, a time-out, 429 and 5xx: 2 retries by default, exponential backoff
  from 0.5 s to 8 s with jitter, or what `Retry-After` / `RateLimit-Reset` say (up to 60 s; longer waits go to you as a
  `RateLimitError`). Other POSTs (exec, actions, fetch…) are never retried: they could run twice.
- **Idempotency keys.** The SDK sends a new `Idempotency-Key` with every create, and the same one on its retries, so a
  retry never starts a second session or run. Pass your own to make your own retries safe:
  `bx.sessions.create(params, { idempotencyKey: "job-42" })`. The same key with another body is an
  `IdempotencyMismatchError` (for a new API key: also when another caller used it).
- **Time limits.** `timeoutMs` per request (default 120 s); long calls (exec, `files.waitFor`, plain-English steps)
  get the time they need.

```ts
const bx = new Boxline({ maxRetries: 3, timeoutMs: 60_000 });
await bx.sessions.get(id, { timeoutMs: 5_000, maxRetries: 0, clientRequestId: "trace-42" });
const patient = bx.withOptions({ maxRetries: 6 });
```

Every request carries `Boxline-SDK: node/<version>`.

## Every method

Every public API operation has a method (the Python SDK has the same names in snake_case; the full list is
`docs/sdk-methods.json` in the platform repository). Session methods take the id first; a `Session` object has the
same methods without it (`session.pause()`).

| Area | Methods |
|---|---|
| Account | `me`, `hasFeature`, `auth.signup`, `auth.login`, `auth.logout`, `project.trajectories`, `project.setTrajectories`, `project.settings`, `project.setSettings`, `apiKeys.list`, `apiKeys.create`, `apiKeys.revoke` |
| Webhooks | `webhooks.create`, `list`, `get`, `update`, `delete`, `rotateSecret`, `test`, `deliveries`, `retryDelivery`; `verifyWebhook` (no request) |
| Sessions | `sessions.create`, `get`, `list`, `update`, `release`, `pause`, `resume`, `move`, `extend`, `rotateProxy`, `rotateUrls`, `live`, `bulk` |
| Browser | `sessions.actions`, `sessions.computer`; on a session: `goto`, `click`, `hover`, `fill`, `type`, `press`, `scroll`, `wait`, `select`, `elements`, `evaluate`, `content`, `screenshot`, `cursor`, `upload`, `tabs`, `newTab`, `switchTab`, `closeTab`, `back`, `forward`, `reload`, `step`, `extract`, `exportCookies`, `computer`, `mouse.move`/`moveBy`/`click`/`down`/`up`/`drag`, `keyboard.key`/`type`/`press` |
| Shell and scripts | `sessions.exec`, `execStream`, `runScript`, `restartShell` |
| Files | `sessions.files.list`, `read`, `readText`, `write`, `delete`, `waitFor` |
| Logs | `sessions.events`, `streamEvents`, `pages`, `recording`, `recordingFrame`; on a session: `waitForHuman`, `onCaptcha` |
| Saved logins | `contexts.create`, `get`, `list`, `rename`, `delete`, `setLogin`, `deleteLogin` |
| Secrets | `secrets.create`, `list`, `get`, `update`, `delete`, `audit` |
| Extensions | `extensions.upload`, `list`, `get`, `delete` |
| Web | `fetch`, `screenshot`, `pdf`, `extract`, `search`, `crawl.start`, `get`, `list`, `cancel`, `pages`, `wait` |
| Agent | `agent.models`, `run`, `get`, `list`, `takeover`, `handBack`, `cancel`, `continueRun`, `sendMessage`, `stream`, `wait` |
| Tasks | `tasks.create`, `list`, `get`, `update`, `delete`, `run`, `runs`, `waitForRun` |
| Usage | `usage`, `stats`, `pricing`, `openapi`, `health` |

## Examples

In `examples/`. Most use the small example site (`npx tsx examples/test-site.ts`), which only a local API's sessions can
reach, so run them with `BOXLINE_API_URL=http://localhost:8080`; `search.ts` and `quickstart.ts` work anywhere.

| File | Shows |
|---|---|
| `quickstart.ts` | a session, Playwright over CDP, the actions API |
| `mixed-download-process-fill.ts` | Playwright download → Python in the shell → files API → a form filled with actions |
| `agent-mixed.ts` | one agent run using the browser and the shell, streamed step by step |
| `script-mixed.ts` | a script mixing Playwright, `child_process`, `fs`, `useModel` and `step()` |
| `page-apis.ts` | fetch, screenshot, pdf, crawl, extract, a page that cannot load |
| `search.ts` | web search, with the top pages fetched as Markdown, and the cache |
| `computer-use.ts` | mouse and keyboard (drag, hover, double-click, keys), each action's `text`, `session.computer()` in both shapes |
| `agent-computer.ts` | an agent run in computer mode, with its thoughts streamed |
| `webhook-receiver.ts` | a receiver (Node `http`) that verifies each delivery and drops duplicates |
| `webhooks.ts` | endpoints, deliveries and their history, re-sending, rotating the secret, a test event |
| `agent-variables.ts` | an agent run with `%email%` / `%password%` limited to one site |
| `tasks.ts` | a task with an output schema on a demo shop: run with a variable, waited for, its history, changed, deleted; an agent run with `output` |
| `secrets.ts` | a secret exported into a shell (its length checked, its value hidden in output), changed, audited, deleted; login details on a saved login |
| `script-use-model.ts` | `useModel`, `step()` and `extract()` in a script |
| `captcha.ts` | noticing a CAPTCHA and handing it to a person |
| `block-ads.ts` | a session that blocks ads and trackers, and its `blockedRequests` count |
| `extension.ts` | a tiny MV3 extension built as a zip, uploaded, loaded into a session, and deleted |
| `list-sessions.ts` | cursor pages and `for await` |
| `reliability.ts` | idempotency keys, request ids, typed errors, time limits |

```bash
pnpm --filter @boxline/sdk build        # in the platform repository: the examples import @boxline/sdk
BOXLINE_API_KEY=bxl_… npx tsx examples/quickstart.ts
```

---

This repository holds the Boxline Node SDK (@boxline/sdk). It is copied from Boxline's main repository on every change. Issues and pull requests are welcome here; accepted changes are made there and arrive with the next copy.
