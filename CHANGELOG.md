# Changelog

All notable changes to `@boxline/sdk`. The SDK follows [semantic versioning](https://semver.org).

## 1.1.0 (2026-10-02)

### Added

- **Partial results from a several-page extract**: a page that did not load (`page_unreachable`, `page_timeout`) or is
  not a web page is listed in `pages` with `status: null`, `finalUrl: null` and `error: {code, message}`, and the call
  fails only when none load.
- **`NotAWebPageError`** (422 `not_a_web_page`, `ErrorCode.notAWebPage`, not retried): `fetch` or `extract` of an
  address that answers with a PDF or another document Chrome only displays.
- **`exec()` reads the streamed answer**: headers come at once, so a command after a long session setup no longer hits
  Node's 300 s headers timeout; `execStream` skips the API's `waiting` and `ping` lines and throws an `error` line as
  the error it names; both allow up to 10 minutes of setup before the command's own time limit.
- **Own model keys and a default model**: `bx.project.modelKeys()`, `setModelKey(provider, {key?, use?})` and `deleteModelKey(provider)`
  (a key is write-only: `preview` is its last 4 characters); `defaultModel` in `project.settings()` / `setSettings()`;
  `keySource` (`"project"` | `"platform"`) on agent runs, extract results and `agent.models()` providers; `AgentProvider` now also
  `"xai"` (Grok) and `"google"` (Gemini); the plan feature `platformModels` (off on Free) and `ownKeyModelCostUsd` in stats.
  Error codes `invalid_model_key`, `model_key_rejected`, `model_error`.
- **Save a sign-in from a working session**: `bx.contexts.create({name, fromSession, attach})` makes a saved login from
  the session's current cookies and site storage; `attach: true` also makes the session save to it from now on.
  `ErrorCode.contextTooLarge` (413 over 16 MB); `PlanLimitError` past the plan's `maxContexts` or `maxContextBytes`
  (new `Plan` fields).
- **Runs whose server stopped**: the run errorCode `server_restarted` (continuable: `agent.continueRun` goes on in the
  same browser; `ErrorCode.serverRestarted`), and `RunNotLiveError` (409 `run_not_live`, `ErrorCode.runNotLive`) from
  `agent.takeover`, `handBack` and `sendMessage` on such a run.
- **Webhook events for everything a receiver may need**: `WebhookEventType` has `session.started`,
  `session.expiring`, `agent_run.started`, `agent_run.waiting`, `agent_run.resumed`, `captcha.solved`, `captcha.failed`,
  `task_run.started`, `task.schedule_paused`, `usage.limit_reached`, `api_key.created`, `api_key.revoked`,
  `secret.changed`, `webhook.changed`, `extension.uploaded` and `extension.deleted`. `events: ["*"]` subscribes to every
  type (`WebhookSubscription`). Typed payloads: `WebhookEventPayload` (a union keyed by `type`, for
  `verifyWebhook<WebhookEventPayload>(…)`), `WebhookEventDataMap` and one interface per `data` shape
  (`WebhookAgentRunWaitingData`, `WebhookUsageLimitData`, …); `WebhookEvent` has `test?`. `bx.webhooks.eventTypes()`
  (`GET /v1/webhooks/events`, `WebhookEventTypeList`); `bx.webhooks.test(id, {type})` sends a sample of any type.
  `verifyWebhook` is unchanged.
- Agent runs carry `variableNames` (the names of the run's own variables, never values): what `continueRun` needs again.

- **Continue a run that stopped at a limit**: `bx.agent.continueRun(runId, {maxSteps, maxCostUsd, instruction,
  variables})` returns the new run (same session; `continuedFrom`), which works with `wait` and `stream` like any run.
  Runs carry `continuable` (`{until}` or null), `continuedFrom`, `continuedBy`, `sessionExpiresAt`, `maxSteps`,
  `maxCostUsd` and `maxConsecutiveErrors`; the stream's `done` event carries `continuable`. Types `ContinueRunParams`,
  `AgentRunErrorCode`; `NotContinuableError` (409 `not_continuable`) and `SessionNotRunningError`.
- **Messages to a working run**: `bx.agent.sendMessage(runId, text)` (`AgentMessageSent`); delivered messages are
  `message` steps (`from`, `id`, `sentAt`, `delivered`) in the run and its stream. `TooManyMessagesError` after 50.
- **Run limits**: `maxSteps` takes 1–1000 or `null` (no step limit), `maxCostUsd` (a money budget) and
  `maxConsecutiveErrors` on `agent.run`; `timeout` and `idleTimeout` for the run's own session. New run errorCodes
  (`ErrorCode.maxSteps`, `maxCost`, `tooManyErrors`, `noProgress`, `sessionTimeout`, `sessionEnded`).
- **Idle timeout**: `idleTimeout` on `sessions.create` and `sessions.update` (null switches it off); sessions carry
  `idleTimeout`, and `endReason` can be `"idle"` (`SessionEndReason`).
- Tasks: `maxSteps: null` (no step limit), `maxCostUsd`, and `timeout` / `idleTimeout` in `browser`.
- `IDEMPOTENT_POSTS` has `/v1/agent/runs/:id/continue` and `/v1/agent/runs/:id/messages`: both send an Idempotency-Key
  and are retried like the other creates.
- **Tasks** (saved agent runs): `bx.tasks.create/list/get/update/delete/run/runs`, with `%name%` variables (plain,
  or `secret: true` with `origins` and `shell`), `secrets` (project secret names, usable by scheduled tasks too), an
  `output` schema, `browser` settings, `savedLogin`, `model`, `maxSteps` and a `schedule` (`cron`, `timezone`, `variables`, `enabled`; `nextRunAt` and `nextRuns`, the next 3 times in UTC, on the schedule; `lastRun`, the newest run, on the task; `null` removes a
  field on update, schedule fields are merged). `tasks.runs(id, {status})` pages a task's run history by cursor; a
  run's status can be `queued` (a scheduled run waiting for its turn), `skipped` and `missed` too.
  `tasks.waitForRun(run | taskId, taskRunId, {pollMs, timeoutMs})` waits for a task run's result. Types `Task`,
  `TaskRun<T>`, `TaskRunStatus`, `TaskVariable`, `TaskBrowser`, `TaskSchedule`, `TaskLastRun`, `TaskScheduleInput`,
  `TaskCreateParams`, `TaskUpdateParams`, `TaskRunParams`, `TaskRunListParams`, `WaitOptions`.
- **Structured output**: `output` (a JSON Schema, `OutputSchema`) on `agent.run`. Runs carry `resultText`, `output`,
  `errorCode` (`ErrorCode.outputInvalid`), `taskId` and `taskRunId`; the stream's `done` event carries `resultText`
  and `errorCode`. `AgentRun<T>`, `agent.get<T>`, `agent.wait<T>` and `agent.stream<T>` type the JSON answer
  (`result` stays `string` by default, as before).
- `MissingVariablesError` (400 `missing_variables`) and `PlanLimitError` (402 `plan_limit`).
- Saving a task and starting a task run send an Idempotency-Key and are retried like the other creates:
  `IDEMPOTENT_POSTS` has `/v1/tasks` and `/v1/tasks/:id/runs` (`:id` is one path segment; `isIdempotentPost(route)`).
- `examples/tasks.ts`.
- **Project secrets** (write-only): `bx.secrets.list/create/get/update/delete/audit`, with `scope` (`"agent"`,
  `"shell"`, `"all"`), `origins`, `shell` and `description`; `preview` shows the last 4 characters of long values,
  never more. `secrets.audit({name})` pages the changes and uses (who, and what used it). Types `Secret`,
  `SecretScope`, `SecretCreateParams`, `SecretUpdateParams`, `SecretAuditEntry`, `SecretAuditParams`. Creating a
  secret is not retried (the API takes no Idempotency-Key there).
- **Saved login details with 2FA**: `bx.contexts.setLogin(id, {origin, username, password, totpSecret})` (a full
  replace), `contexts.updateLogin(id, {origin?, username?, password?, totpSecret?})` (keeps what is not sent;
  `totpSecret: null` removes 2FA; a new `origin` needs `password`, and `totpSecret` when the login has 2FA) and
  `contexts.deleteLogin(id)`; contexts carry `login` (`ContextLogin`: never the password or the 2FA secret);
  `loginDetails` in `PlanFeature`. Types `LoginDetails`, `LoginDetailsUpdate`, `ContextLogin`.
- **Shell environment and secrets**: `env` and `secrets` on `sessions.create` (sessions show the names in `env` and
  `secrets`), `secrets` on `exec` and `execStream` for one command; `sessions.move` also returns `shell` (`MoveShell`:
  the directory, the exported variables that came along, the processes that were stopped).
- **Secrets for the AI**: `secrets` on `agent.run` (and `context`, a saved login for the run's own session), on
  `session.step()` (`StepOptions`) and the step action, and on `runScript` with `login` (the saved login's details for
  `step()`); `allowWithExtensions` on steps and `runScript`, as on `agent.run`.
- `TooManySecretValuesError` (409 `too_many_secret_values`), `SecretExistsError` (409 `secret_exists`),
  `SecretNotAllowedError` (400 `secret_not_for_ai` / `secret_not_for_shell`), `MachineTooOldError` (409
  `machine_too_old`); `PlanLimitError` also for secrets beyond `maxSecrets`. `plan_limit` is always 402 (a session longer than the plan allows was 403).
- Plans carry `tasks`, `schedules` and `maxSecrets`.
- `examples/secrets.ts`.
- `emailVerified` and `termsCurrentVersion` on `me().user`; `"account_recovered"` as a webhook endpoint's
  `disabledReason` and a session's `endReason` (a password reset recovered an account whose email was not confirmed).

## 1.0.0 (not published yet)

The first stable release: every public API operation has a method, and calls are retried safely.

### Added

- **Web search**: `bx.search({query, limit, country, language, recency, safeSearch, fetch, proxy})`, with the top
  pages as Markdown when `fetch` is set; `SearchUnavailableError`; `webSearch` in `PlanFeature`, `searchesPerMonth` and
  `extraSearchesPer1000Usd` on plans, `Usage.searches`, `Pricing.webSearch`.
- **Mouse, keyboard and computer use**: `session.mouse.move/moveBy/click/down/up/drag`, `session.hover`,
  `session.keyboard.key/type/press`, `session.cursor()`; `click` takes `button`, `count` and `modifiers`, `scroll`
  takes `deltaX` and `modifiers`, `screenshot` takes `maxWidth` and `cursor`; the `move`, `hover`, `mouse_down`,
  `mouse_up`, `drag`, `key` and `cursor` actions; bare strings in action lists are plain-English steps; results carry
  `text`. `session.computer(action, {maxWidth, screenshot, format, quality, cursor})` / `bx.sessions.computer(id, …)`
  runs one Anthropic- or OpenAI-shaped computer-use action and returns the screen; `OutOfViewportError`.
- **Agent**: `agent.run({mode: "computer"})`, `mode` on runs, `thought` on steps and the `thought` stream event,
  `supportsComputerUse` and `computerTool` in `agent.models()`.
- `ModelRefusedError` (422 `model_refused`, extract).
- **Webhooks**: `bx.webhooks.create/list/get/update/delete/rotateSecret/test/deliveries/retryDelivery` (deliveries
  page by cursor, filter by `status`, and carry `errorCode` and their attempt `history`; endpoints carry
  `pausedUntil`), and `verifyWebhook(body, header, secret | secrets, {toleranceSeconds})`, which accepts exactly
  what the API's signer makes (checked against its vectors) and throws `WebhookSignatureError` (`reason`);
  `webhookSignatureHeader()` for tests. `WebhookUrlNotAllowedError`, `WebhooksUnavailableError`,
  `WebhookDisabledError`, `PayloadExpiredError`, and the `queue_full` code; `webhookEndpoints` on plans.
- **Project settings**: `bx.project.settings()` and `setSettings({captchaDefault})`.
- **Accounts and retention**: `auth.signup({name})`; `name` on users, `termsVersion` and `termsUpdate` on `me().user`;
  `retentionDays` on plans (how long an ended session's recording, logs and run steps are kept) and `dataDeletedAt`
  on sessions (when they were deleted).
- **Browser settings**: `blockAds` and `cookieBanners` (`"reject"` | `"off"`) on `sessions.create`, `update` and
  `agent.run`; `blockAds` on `fetch`, `screenshot`, `pdf`, `extract` and `crawl.start`; sessions carry `blockAds`,
  `blockedRequests`, `cookieBanners` and `extensions`.
- **Chrome extensions**: `bx.extensions.upload(zip)` (bytes, an ArrayBuffer, a Blob or a file path; raw
  `application/zip`; with an automatic Idempotency-Key), `list`, `get`, `delete`; `extensions: [id]` on
  `sessions.create` and `agent.run`; `allowWithExtensions` on `agent.run`; `ExtensionInfo`; `extensions` in
  `PlanFeature`. `VariablesWithExtensionsError`, `ExtensionDeniedError`, `CrossSiteRequestError`,
  `InvalidExtensionError`, `PayloadTooLargeError` and `LimitReachedError`.

- **Every public endpoint.** New: `auth.signup`, `auth.login`, `auth.logout`, `apiKeys.list/create/revoke`,
  `sessions.live` (fresh signed URLs, also `session.live()`), `sessions.streamEvents` (server-sent events),
  `sessions.recordingFrame`, `agent.stream` (a run as it happens), `crawl.pages`, `pricing`, `openapi`, `health`.
  Session methods are also on `bx.sessions` with the id first (`bx.sessions.pause(id)`), next to the `Session` object.
- **Browser helpers** on a session: `type`, `press`, `scroll`, `wait`, `select`, `elements`, `evaluate`, `upload`,
  `tabs`, `newTab`, `switchTab`, `closeTab`, `back`, `forward`, `reload`; `click` also takes `{x, y}`.
- **Retries** with exponential backoff (0.5 s to 8 s) and jitter after network errors, time-outs, 429 and 5xx, for
  GETs and for the calls that create or start something; `Retry-After` and `RateLimit-Reset` are honoured. Option
  `maxRetries` (default 2), per client or per call.
- **Idempotency keys**: a new `Idempotency-Key` per create call, reused by its retries; pass `idempotencyKey` for your
  own.
- **Time limits**: `timeoutMs` per client (default 120 s) or per call; long calls get the time they need.
- **Typed errors**: `BoxlineError` now has `requestId` (the API's) and `clientRequestId` (yours), `headers`, `body` and
  `retryable`, with subclasses `RateLimitError`, `FeatureNotInPlanError`, `ProjectSuspendedError`,
  `IdempotencyMismatchError`, `IdempotencyInProgressError`, `InvalidCursorError`, `CaptchaTimeoutError`,
  `PageUnreachableError`, `PageTimeoutError`, `AuthenticationError`, `NotFoundError`, `BoxlineConnectionError`,
  `BoxlineTimeoutError`, and the `ErrorCode` constants.
- **Cursor pages**: every list takes `limit` and `after` and returns a `Page` (`data`, `next`, `hasNextPage()`,
  `getNextPage()`, `iterPages()`); `for await` over a list goes through every page.
- `clientRequestId` option (sent as `X-Client-Request-Id`), `headers` option, `bx.withOptions()`, the
  `Boxline-SDK: node/1.0.0` header.
- Types matched to the API description: `me().user` can be null, `Usage.from/to/running`, `AgentRun.createdAt` and
  `finishedAt`, CAPTCHA steps, agent-run variables with `origins` and `shell`, `fetch` `links`/`delayMs`/`viewport`,
  `ExecResult.truncated`, `CrawlJob.next` as a cursor string, the `select` and `elements` actions, and the session's
  `checkpointAt`, `recoveries`, `error`, `recordSession`, `hasRecording`, `setup`, `setupStatus`, `setupError`.
- Runnable examples in `examples/`, including browser + shell + files in one session.

### Changed (breaking)

- The default API is `https://api.boxline.dev` (it was `http://localhost:8080`); `BOXLINE_API_URL` and `baseUrl`
  still choose another one.
- `auth.signup` needs `acceptTerms: true` (the user accepts the terms of service and acceptable use policy); the API
  refuses a signup without it (400 `terms_not_accepted`).

- List methods return a `Page` instead of an array: use `(await bx.agent.list()).data`, or `for await`.
  `agent.list` and `crawl.list` take `{limit, after}` instead of a number.
- `crawl.get(id, {limit, after})`: the `offset` option is gone (the API still accepts it), and `CrawlJob.next` is a
  cursor string, not a number.
- `session.events()` resolves to a `Page` (`data`, `nextAfter` and `next` as before).
- `BoxlineError`'s constructor takes a fourth `details` argument; errors are instances of the subclasses above.
- `request()` and `send()` take request options (`timeoutMs`, `maxRetries`, `headers`, …) as their fourth argument.

### Fixed

- Logging a client or a session (`console.log`, `JSON.stringify`) no longer shows the API key: the client's key is
  kept out of enumerable fields, and a session serializes to its data only.

### Deprecated

- `sessions.page()`: use `sessions.list()` (its first page has `total`).
- `session.shell.restart()` and `session.browser.exportCookies()`: use `session.restartShell()` and
  `session.exportCookies()`.

## 0.1.0

- The first version: sessions, actions, exec, files, contexts, the agent, crawl and the quick APIs.
