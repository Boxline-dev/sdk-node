# Changelog

All notable changes to `@boxline/sdk`. The SDK follows [semantic versioning](https://semver.org).

## 3.1.0 (2026-10-09)

Every run reads as a clear story: what the agent saw, thought and did, what came out, and what it cost. All additions;
nothing breaks, and it works with the API that serves them (older runs simply lack the new fields).

### Added

- **Agent run steps** (`AgentStep`, from `bx.agent.get` / `wait` and the run's event stream) have new optional fields:
  `n` (the step's number, from 1, stable), `screen` (`{frame, url, title, image}`: the screen the action led to; for a step
  the model got a screenshot for it is that exact image, `image` is the recording frame's address), `shell` (`{exitCode,
  files:[{path, bytes}], more?}` of a bash step: the workspace files the command created or changed) and `usage`
  (`{inputTokens, outputTokens, costUsd}` of the model reply the step is the first of; the steps add up to the run's
  `usage`). New types `StepScreen`, `StepShell` and `StepUsage`. `thought` now also holds the model's reasoning when the
  provider gives it in words (OpenAI's reasoning summaries, Claude's thinking), so computer-use steps have one too. Click
  steps name what was clicked (`Clicked “Jobs” link at (814, 124)`).
- **Session events**: a new event type `files` (the Files API's writes and deletes: `{op, path, bytes?, by}`), `action`
  events carry their result line as `text` and `data: {action, by, runId?, step?, line?, frame?, code?}` (`by`: `api`,
  `agent` or `script`; `line`: the line of a playground script's `step()` call; `code`: a failure's API error code), and
  an agent's `exec` event has `data.step` and `data.files`. New types `ActionEventData` and `FilesEventData`
  (`SessionEvent` narrows `data` by `type`).
- **`runId`** on `sessions.events(id, { runId })`, `session.events({ runId })` and `streamEvents`: only the events one agent
  run caused in the session, which link to its steps by run id and step number.

## 3.0.0 (2026-10-07)

The API tree was redesigned for fewer, more predictable calls: one call per job, a change takes the same shape as the create,
and nothing is kept as an alias. This release matches it: the old methods and
fields are gone, not deprecated. Needs an API from 7 October 2026 or later.

### Breaking

**Sessions**

- **One `update` for a running session; `extend`, `rotateProxy`, `rotateUrls`, `live`, `move` and `setProxy` are gone**, on
  `bx.sessions` and on the `Session` object. `session.update({ timeout })` sets the session's length in seconds from its last
  start (it replaces `extend(seconds)`, which added time), `update({ rotateProxy: true })` and `update({ rotateUrls: true })`
  do what the rotate methods did, `update({ proxy })` replaces `setProxy(proxy)`, and `bx.sessions.get(id)` returns fresh
  signed `connectUrl`, `liveUrl` and `terminalUrl` every time, which replaces `live()`. What is fixed at create (`browser` or
  `shell` on or off, `viewport`, `profile`, `recordSession`, `setup`, `extensions`, `env`, `credentials`) throws the new
  `NotUpdatableError` (400 `not_updatable`).
- **Sessions no longer move.** `sessions.move()`, `session.move()`, the `moves` field of `SessionData` and the types
  `MoveTimings`, `MoveShell` and `SessionUrls` are gone; the platform still moves a session itself when a machine goes away.
- **`sessions.page()` is gone**: `sessions.list()` returns a page you can `await` (with `total`) or iterate.
- **Lists take `after` only.** `offset` is removed from `SessionListParams`, and `SessionPage` no longer has `offset`;
  `SessionListFilters` (the old alias of `SessionListParams`) is gone.
- **`session.browser.exportCookies` and `session.shell.restart` are gone** (deprecated since 1.0.0): use
  `session.exportCookies()` and `session.restartShell()`. The names `session.browser` and `session.shell` are not used by
  anything now and will not come back.
- **`liveUrl` is `null` without a browser** (it was set on a shell-only session). `connectUrl` and `liveUrl` are `null`
  without a browser, `terminalUrl` without a shell.
- **Browser calls need a browser.** `actions`, `computer`, `runScript` and `exportCookies` (and the `Session` methods built on
  them: `goto`, `click`, `step`…) on a session created with `browser: false` throw `BrowserDisabledError` (409
  `browser_disabled`); they used to drive a hidden Chrome. Calls that need a shell on a session without one throw
  `ShellDisabledError` (409 `shell_disabled`).
- **Paths.** The SDK calls the new canonical routes: `…/browser/actions`, `…/browser/computer`, `…/browser/script`,
  `…/browser/export-cookies`, `…/shell/exec`, `/v1/crawls`, `/v1/project/api-keys`, `/v1/project/usage`,
  `/v1/webhooks/event-types` and `…/events/stream` for a run. It cannot talk to an API from before 7 October 2026.

**Agent runs**

- **`agent.run` takes `session`, a `SessionSpec`** (the type `sessions.create` takes: `browser`, `shell`, `timeout`,
  `idleTimeout`, `keepAlive`, `viewport`, `userMetadata`, `profile`, `recordSession`, `setup`, `proxy`, `captcha`, `blockAds`,
  `cookieBanners`, `extensions`, `env`, `credentials`). The flat fields `browser`, `shell`, `proxy`, `captcha`, `blockAds`,
  `cookieBanners`, `extensions`, `profile`, `timeout` and `idleTimeout` are removed from `AgentRunParams`; the API answers
  400 `invalid_request` when they are sent. A shell-only run is `session: { browser: false, shell: true }`. `sessionId`,
  `keepSession`, `credentials`, `variables`, `allowWithExtensions`, the limits, `output` and the model fields stay.
- **`agent.takeover()` is now `agent.pause()`**, and `agent.handBack(id, note)` is now `agent.resume(id, { note })`: the same
  run goes on (one job, one run id). `agent.continueRun()` is gone: `agent.resume(id, { maxSteps, maxCostUsd, note,
  variables })` continues a run that stopped early, **in the same run**, not a new one. `note` is the one text field: for a
  paused run or one that stopped early, it is an extra note for the model. `ContinueRunParams` became
  `ResumeRunParams`, `NotContinuableError` became `NotResumableError` (`ErrorCode.notResumable`, 409 `not_resumable`).
- **`continuable` is `resumable`** (on `AgentRun`, the stream's `done` event and the `agent_run.finished` webhook data);
  `continuedFrom` and `continuedBy` are gone, and so is `continuedFrom` on `agent_run.started`. `agent_run.resumed` has
  `by: "limit"` and `via: "resume"` for a run that stopped early and was resumed.

**Tasks**

- **`session` replaces `browser` and the top-level `profile`** on `tasks.create`, `tasks.update` and the `Task` you read
  (`TaskBrowser` and `TaskProfile` are gone; `session.profile` takes a profile). A task can be shell only. `allowWithExtensions`
  is the task's own field. Saved tasks were moved to `session` by the API. `session.env` is stored sealed and read back as names.

**Webhooks, credentials, project**

- **`webhooks.rotateSecret(id)` is gone**: `webhooks.update(id, { rotateSecret: true })` returns the endpoint with the new
  `secret` (a `NewWebhookEndpoint`).
- **`credentials.rotateCodeUrlSecret(name)` is gone**: `credentials.update(name, { rotateCodeUrlSecret: true })` answers with
  the new `codeUrlSecret`.
- **`project.trajectories()` and `project.setTrajectories()` are gone**: `project.settings()` returns `trajectories` and
  `project.setSettings({ trajectories: { enabled, source? } })` changes it.
- **`stats()` is gone**: `bx.usage({ from, to })` has `running`, `concurrencyLimit`, `agentRuns`, `modelCostUsd` and
  `ownKeyModelCostUsd`, and the same per day in `byDay`. `Stats` and `StatsDay` are removed.

**Types**

- `CreateSessionParams` is now an alias of `SessionSpec`. `SessionEvent` is a union on `type`: an `exec` event has
  `data.by` (`api`, `agent`, `setup` or `script`) and `data.runId`; `SessionEventType` and `ExecEventData` are new.
  `FileEntry.type` can be `"symlink"`.

### Added

- **`files.archive(sessionId, path?)`** (and `session.files.archive(path?)`): a folder, or the whole workspace, as one
  `.tar.gz` (the bytes). Typed errors: `ArchiveTooLargeError`, `ArchiveBusyError`, `InvalidPathError`, `NotADirectoryError`.
- **Files of a stopped session.** `files.list`, `files.read`, `files.readText` and `files.archive` work on a stopped session,
  read-only and without starting a machine, until it is deleted (`NothingSavedError` when it saved nothing).
- **Shell-only sessions and runs** in the README and the types (`browser: false`), with `BrowserDisabledError` and
  `ShellDisabledError`.
- **`SessionSpec`**, `ProjectSettingsParams`, `ResumeRunParams`, `TaskSession`, `ExecEventData`, `SessionEventType` and
  `Usage` with its new fields.
- The `exec` events of a session say who ran each command (`data.by`, and `data.runId` for an agent).

### Upgrading from 2.x

| 2.x | 3.0.0 |
|---|---|
| `sessions.extend(id, 60)` | `sessions.update(id, { timeout: <the new length in seconds> })` |
| `session.rotateProxy()` / `rotateUrls()` | `session.update({ rotateProxy: true })` / `update({ rotateUrls: true })` |
| `session.setProxy(p)` | `session.update({ proxy: p })` |
| `session.live()` | `session.refresh()` (or `sessions.get(id)`): fresh URLs every time |
| `session.move()` | none |
| `sessions.page(f)` | `sessions.list(f)` |
| `session.browser.exportCookies()` / `session.shell.restart()` | `session.exportCookies()` / `session.restartShell()` |
| `agent.run({ browser, shell, proxy, … })` | `agent.run({ session: { browser, shell, proxy, … } })` |
| `agent.takeover(id)` / `agent.handBack(id, note)` | `agent.pause(id)` / `agent.resume(id, { note })` |
| `agent.continueRun(id, p)` and `run.continuable` | `agent.resume(id, p)` (the same run) and `run.resumable` |
| `tasks.create({ browser, profile })` | `tasks.create({ session: { …, profile } })` |
| `webhooks.rotateSecret(id)` | `webhooks.update(id, { rotateSecret: true })` |
| `credentials.rotateCodeUrlSecret(name)` | `credentials.update(name, { rotateCodeUrlSecret: true })` |
| `project.trajectories()` / `setTrajectories(on)` | `project.settings().trajectories` / `project.setSettings({ trajectories: { enabled } })` |
| `bx.stats(days)` | `bx.usage({ from, to })` |

## 2.0.0 (2026-10-05)

### Breaking

- **Three actions replace `release` and `pause`: stop, resume, delete.** `session.stop()` / `sessions.stop(id)` saves the
  session exactly as it is (the whole browser, every tab with its history, and the files), frees the machine and stops
  billing; `resume()` brings it back on a fresh machine with the same id; `session.delete()` / `sessions.delete(id)` ends
  it for good and deletes what it saved, its recording and its logs now. `release()` and `pause()` are gone, and so is
  `bulk("release" | "pause" | …)`: `bulk` takes `"stop"`, `"resume"` or `"delete"`.
- **A session you stop can be resumed.** Everything that ended a session (its `timeout`, an `idleTimeout`, no clients, an
  agent run finishing, a spending limit, a lost machine) now stops it, keeping it for the plan's `retentionDays`
  (`deletesAt`). A stopped session is free and does not count towards concurrency. `resume()` throws a 409
  `nothing_saved` error (`NothingSavedError`, `ErrorCode.nothingSaved`) when nothing was saved (a machine lost before its first checkpoint).
- **A call on a stopped session no longer resumes it.** Actions, files, exec and connect on a `STOPPED` session fail with
  409 `session_not_running`: call `resume()` first. An agent run given a stopped `sessionId`, and `continue`, resume it.
- **A stop ends the session's URLs for good.** Stopping rotates `connectUrl`, `liveUrl` and `terminalUrl` (as `rotateUrls`
  does): the ones you held before the stop stay refused after a resume, and the session `resume()` returns has fresh
  ones. Stop, resume and delete are limited to 60 calls a minute per project (a bulk call counts as one); beyond it, 429
  `rate_limited`.
- **Statuses and fields.** `SessionStatus` is `"RUNNING" | "STOPPED" | "DELETED" | "ERROR"` (`"PAUSED"` and `"COMPLETED"`
  are gone). `SessionData` has `stoppedAt`, `stopReason` (`SessionStopReason`: `requested`, `timeout`, `idle`,
  `no_clients`, `agent_run`, `task`, `machine_lost`, `api_restart`, `account_recovered`, `suspended`, `spend_limit`, `out_of_credit`),
  `deletesAt`, `deletedAt` and `deleteReason`; `endedAt`, `endReason` (`SessionEndReason`) and `dataDeletedAt` are gone.
- **Webhooks.** `session.stopped` and `session.deleted` replace `session.ended` (`WebhookEventType`,
  `WebhookEventDataMap`); an endpoint that listened for `session.ended` has to listen for them.
- **Plans and prices.** The plan feature `pauseResume` is gone (stop and resume work on every plan), and
  `Pricing.pausedSessions` became `Pricing.stoppedSessions` (`{perHour: 0}`).

### Added

- **Spending limits and credit in the types.** A session's `endReason` can be `"spend_limit"` (the organization or the
  project reached the monthly spending limit its owners set) or `"out_of_credit"`; a run's `errorCode` can be
  `"out_of_credit"`; `WebhookUsageLimitData.kind` can be `"spend_limit"`, `"project_spend_limit"` or `"credit"`. Calls
  refused for these fail with 402 (`spend_limit`, `out_of_credit`), like the model spend cap.

- **Which limit refused a 402.** `BoxlineError.details` holds the error body's `error.details` (null without):
  a 402 `spend_limit` or `out_of_credit` has `details.limit`, `"organization"`, `"project"`, `"plan"` or `"credit"` (type `SpendLimitKind`).

## 1.3.0 (2026-10-03)

### Added

- **Time limits that fit the server.** `session.login`, `typeCredential` with `field: "otp"` and plain-English steps that use `%NAME.otp%` or
  `%NAME.link%` wait as long as the server may (up to 24 minutes for `login`, 16 for a code), instead of the
  default 120 s that cut off a login waiting for a pushed code.

- **Codes from your own system.** A password credential's `codeSource` is `"totp"` (the authenticator key,
  `totpSecret`; `totpSecret` alone still means this), `"push"` or `"url"`, or null for no 2FA; with `"push"` or
  `"url"` a run, action or `boxline-otp` that needs a code (or a sign-in link) waits for a fresh one, up to
  `codeTimeoutSeconds` (5 to 900, default 300). `credentials.create` and `credentials.update` take `codeSource`,
  `codeUrl` (a public HTTPS endpoint the platform asks with a signed POST) and `codeTimeoutSeconds`; a `PasswordCredential`
  shows `codeSource`, `codeUrl` and `codeTimeoutSeconds`. Changing `codeSource` or `codeUrl` needs the `password` again
  (400 `invalid_request`, 409 `conflict` on a race). With a `codeUrl` the answer has `codeUrlSecret` once (type
  `CredentialWritten`). Types `CredentialCodeSource` and `CredentialWritten`.
- **`credentials.pushCode(name, {code} | {link})`**: sends the code or sign-in link the site emailed or texted to a wait
  in progress (used once, kept sealed for 10 minutes; a link must be on one of the credential's sites). Types
  `CredentialCodePush` and `CredentialCodeAccepted`. Not retried by the SDK.
- **`credentials.rotateCodeUrlSecret(name)`**: a new `codeUrlSecret` for the requests to `codeUrl` (check them with
  `verifyWebhook`).
- **`session.login(credential?, {url?, allowWithExtensions?})`** and the `login` action: signs the browser in with a
  password credential in one call (a short browser-only agent run with that one credential and its sites). Resolves to
  `{url, title, runId}` (`LoginValue`); an `ActionResult` of a failed `login` has `runId` and a `code`.
- Errors `CredentialCodeTimeoutError` (`credential_code_timeout`: no code or link in time), `CredentialLinkWrongSiteError`
  (`credential_link_wrong_site`), `CredentialLoginFailedError` (`credential_login_failed`, with `runId`),
  `CredentialLoginTimeoutError` (`credential_login_timeout`: the login ran out of time, 15 steps plus the credential's
  `codeTimeoutSeconds` for a pushed or asked code, and its run was canceled; a kind of `CredentialLoginFailedError`) and
  `CodeUrlNotAllowedError` (`code_url_not_allowed`), and the matching `ErrorCode` values.
- `session.login` resolves to the page's origin only (`value.url`) when the page is the one a sign-in link opened, since
  such a link can keep its token in the path.
- The webhook event `credential.code_needed` (`WebhookCredentialCodeNeededData`: `credential`, `type`, `sessionId`,
  `runId`): a run waits for a code or link, so forward the site's email or SMS now. Never a code or link.
- The credentials audit has `action: "code"` for a pushed code or link (never its value).
- An agent run's steps (and `agent.stream` events) have `type: "code"` while it waits for a code or link: `state`
  `"waiting"` (push it now), then `"received"` or `"timeout"`, with `credential` and `kind`; never the value.

## 1.2.0 (2026-10-03)

### Added

- **Credentials**: `bx.credentials.list/create/get/update/delete/audit` (`/v1/credentials`), one place for what the AI
  types and the shell uses, with a typed union per type: a **password** (`origins`, `username`, `password`, optional
  `totpSecret`; shown as `PasswordCredential` with `username` and `hasTotp`) and a **secret** (`value`, optional
  `origins`; shown as `SecretCredential` with `preview`). `credentials.create` returns the matching type; `scope`,
  `shell`, `description` and the write-only rules are as for secrets. Types `Credential`, `CredentialType`,
  `CredentialScope`, `CredentialField`, `PasswordCredential`, `SecretCredential`, `CredentialCreateParams`,
  `PasswordCredentialCreateParams`, `SecretCredentialCreateParams`, `CredentialUpdateParams`,
  `CredentialAuditEntry` (with `type`, and the new `usedBy` kinds `action` and `otp`) and `CredentialAuditParams`.
  Passwords need the plan's `loginDetails`; `PlanLimit` is `maxCredentials`.
- `credentials.update` that makes an AI-only credential readable by shells (`scope` to `"shell"` or `"all"`, or
  `shell: true`) needs the values again in the same call, like a new site (the API answers 400 `invalid_request`
  otherwise, 409 `conflict` when the sites, scope or `shell` changed meanwhile).
- **`credentials: ["NAME"]`** where the API takes them: `sessions.create` (exported into the shell: a secret as `$NAME`,
  a password as `$NAME_USERNAME` and `$NAME_PASSWORD`; `boxline-otp NAME` prints its 2FA code), `exec` and `execStream`,
  `agent.run` and `session.step()` and the step action (placeholders `%NAME%`, `%NAME.username%`, `%NAME.password%`,
  `%NAME.otp%`), `runScript`, and `tasks.create` / `tasks.update` (a task shows its `credentials`). A `Session` lists
  the exported `credentials`.
- **`session.typeCredential(name, {field, selector, allowWithExtensions})`** and the `type` action with `credential`
  (and `field`: `"username"`, `"password"` or `"otp"`): a credential's value typed into a field without passing
  through your code, only on the credential's sites.
- **`profiles.update(id, {name?, credential?})`**: rename a profile and/or link the password credential it signs in
  with (`credential: null` unlinks it). A `Profile` has `credential`; sessions with the profile, and the agent runs,
  task runs and steps in them, get that credential as if it were listed.
- Errors `CredentialExistsError` (409 `credential_exists`), `CredentialNotAllowedError` (400 `credential_not_for_ai`
  / `credential_not_for_shell`), `TooManyCredentialValuesError` (409 `too_many_credential_values`) and
  `ErrorCode.credentialNotFound` (404 `credential_not_found`, a `NotFoundError`). The webhook event `credential.changed`
  (`WebhookCredentialChangedData`: `name`, `action`, `type`, `by`, `changed`).
- `examples/credentials.ts`.

### Changed (breaking)

Nothing above shipped before, so these old names are gone with no aliases.

- **Secrets and profile login details became credentials.** `bx.secrets` is `bx.credentials`; `secrets` on
  `sessions.create`, `exec`, `agent.run`, steps, `runScript` and tasks is `credentials` (`Session.secrets` is
  `Session.credentials`, `Task.secrets` is `Task.credentials`); `login: true` on `runScript` is gone (list the
  credential); `profiles.setLogin`, `updateLogin` and `deleteLogin`, `Profile.login`, `LoginDetails`,
  `LoginDetailsUpdate` and the placeholders `%login.username%`, `%login.password%` and `%login.otp%` are gone: create a
  password credential and link it with `profiles.update(id, {credential})`. Types `Secret`, `SecretScope`,
  `SecretCreateParams`, `SecretUpdateParams`, `SecretAuditEntry` and `SecretAuditParams` are replaced by the credential
  types above; `SecretExistsError`, `SecretNotAllowedError` and `TooManySecretValuesError` by `CredentialExistsError`,
  `CredentialNotAllowedError` and `TooManyCredentialValuesError`; the plan field `maxSecrets` is `maxCredentials`; the
  webhook event `secret.changed` is `credential.changed`.
- **Saved logins (contexts) are now browser profiles.** `bx.contexts` is `bx.profiles` (`create`, `get`, `list`,
  `update`, `delete`; the routes are `/v1/profiles`; `contexts.rename` is `profiles.update(id, {name})`). Sessions and
  agent runs take `profile: {id, persist?}` instead of `context`; tasks take `profile` instead of `savedLogin` (and
  show it); a `Session` has `profileId` and `profilePersist` instead of `contextId` and `contextPersist`; the plan
  fields are `maxProfiles` and `maxProfileBytes`, the plan feature is `"profiles"`, and the error code is
  `ErrorCode.profileTooLarge` (`profile_too_large`). Types: `Profile` (was `ContextInfo`) and `TaskProfile`; the class
  `Contexts` is `Profiles`. New profiles have ids starting with `prof_`. The old names are gone.

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
