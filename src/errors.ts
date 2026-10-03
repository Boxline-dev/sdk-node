/**
 * Errors. Every failed call throws a BoxlineError (or a subclass) with the HTTP status, the API's stable
 * snake_case `code`, a message for people, the API's `requestId` to quote when asking for support, and your own
 * `clientRequestId` if you sent one.
 */

/** Stable error codes the SDK gives its own class to (docs/CONTRACT.md "Errors"). */
export const ErrorCode = {
  rateLimited: "rate_limited",
  concurrencyLimit: "concurrency_limit",
  featureNotInPlan: "feature_not_in_plan",
  projectSuspended: "project_suspended",
  idempotencyMismatch: "idempotency_mismatch",
  idempotencyInProgress: "idempotency_in_progress",
  invalidCursor: "invalid_cursor",
  captchaTimeout: "captcha_timeout",
  pageUnreachable: "page_unreachable",
  pageTimeout: "page_timeout",
  notAWebPage: "not_a_web_page",
  modelRefused: "model_refused",
  searchUnavailable: "search_unavailable",
  outOfViewport: "out_of_viewport",
  webhookUrlNotAllowed: "webhook_url_not_allowed",
  webhooksUnavailable: "webhooks_unavailable",
  webhookDisabled: "webhook_disabled",
  payloadExpired: "payload_expired",
  /** A delivery's errorCode (never an HTTP error): the project already had 10,000 deliveries waiting. */
  queueFull: "queue_full",
  invalidSignature: "invalid_signature",
  variablesWithExtensions: "variables_with_extensions",
  extensionDenied: "extension_denied",
  crossSiteRequest: "cross_site_request",
  invalidExtension: "invalid_extension",
  payloadTooLarge: "payload_too_large",
  limitReached: "limit_reached",
  missingVariables: "missing_variables",
  planLimit: "plan_limit",
  tooManyCredentialValues: "too_many_credential_values",
  credentialExists: "credential_exists",
  credentialNotFound: "credential_not_found",
  credentialNotForAi: "credential_not_for_ai",
  credentialNotForShell: "credential_not_for_shell",
  /** 408 for `boxline-otp` and the type action, an action result's code in a list: no code or link arrived in time. */
  credentialCodeTimeout: "credential_code_timeout",
  credentialLinkWrongSite: "credential_link_wrong_site",
  /** An action result's code: the `login` action could not sign in. */
  credentialLoginFailed: "credential_login_failed",
  /** An action result's code: the `login` action ran out of time and its run was canceled. */
  credentialLoginTimeout: "credential_login_timeout",
  codeUrlNotAllowed: "code_url_not_allowed",
  machineTooOld: "machine_too_old",
  /**
   * An agent or task run's errorCode (never an HTTP error): the answer did not match the run's output schema after the
   * repair try (the run's `error` lists the problems).
   */
  outputInvalid: "output_invalid",
  /**
   * Agent-run errorCodes (never HTTP errors) for a run that stopped at one of its limits and can be continued
   * (agent.continueRun) while its `continuable` is set: its maxSteps, its maxCostUsd, maxConsecutiveErrors tool errors in
   * a row, or the same call with the same result 5 times in a row.
   */
  maxSteps: "max_steps",
  maxCost: "max_cost",
  tooManyErrors: "too_many_errors",
  noProgress: "no_progress",
  /**
   * Agent-run errorCode (continuable like the limits): the API server running the loop stopped (a restart, a deploy)
   * while its session went on; agent.continueRun picks it up in the same browser.
   */
  serverRestarted: "server_restarted",
  /** Agent-run errorCodes: its session reached its time limit, or ended another way, while it worked (not continuable). */
  sessionTimeout: "session_timeout",
  sessionEnded: "session_ended",
  /** 409: agent.continueRun on a run that did not stop at a limit, was continued already, or whose window passed. */
  notContinuable: "not_continuable",
  /** 409: agent.sendMessage after 50 messages to one run. */
  tooManyMessages: "too_many_messages",
  /** 409: takeover, handBack or sendMessage on a run whose server stopped (continue it instead). */
  runNotLive: "run_not_live",
  /** 400: project.setModelKey when the provider does not accept the key (nothing is saved). */
  invalidModelKey: "invalid_model_key",
  /** 400: a call on the project's own model key was refused by the provider (a run ends with this errorCode); never falls back to Boxline's key. */
  modelKeyRejected: "model_key_rejected",
  /** 502: another failure of a call on the project's own model key (the provider's text, key scrubbed). */
  modelError: "model_error",
  /** 413: profiles.create({fromSession}) when the session's cookies and site storage exceed 16 MB. */
  profileTooLarge: "profile_too_large",
  /** 409: the session has ended (e.g. an agent run or continueRun in it). */
  sessionNotRunning: "session_not_running",
  unauthorized: "unauthorized",
  notFound: "not_found",
  connectionError: "connection_error",
  timeout: "timeout",
} as const;

export interface ErrorDetails {
  /** The API's request id (error body, else the X-Request-Id header); null when no response came back. */
  requestId?: string | null;
  /** Your own id for the request (RequestOptions.clientRequestId), as the API echoed it in X-Client-Request-Id. */
  clientRequestId?: string | null;
  headers?: Headers;
  /** The parsed error body, when there was one. */
  body?: unknown;
  cause?: unknown;
}

/**
 * 5xx answers that are not the platform's own trouble, so they are not retried by themselves: configuration (a model
 * provider, proxies or webhook delivery not set up), and a page that could not be loaded (fix the address; a page_timeout may be worth
 * one more try of your own, with a longer timeoutMs).
 */
const NOT_RETRYABLE = new Set(["provider_unavailable", "proxy_unavailable", "webhooks_unavailable", "page_unreachable", "page_timeout", "not_a_web_page"]);

export class BoxlineError extends Error {
  readonly status: number;
  readonly code: string;
  /** The API's id for the request: quote it when asking for support. */
  readonly requestId: string | null;
  /** Your own id for the request, if you sent one (RequestOptions.clientRequestId). */
  readonly clientRequestId: string | null;
  /** Response headers (RateLimit-*, Retry-After, …); undefined when no response came back. */
  readonly headers?: Headers;
  readonly body?: unknown;

  constructor(status: number, code: string, message: string, details: ErrorDetails = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "BoxlineError";
    this.status = status;
    this.code = code;
    this.requestId = details.requestId ?? null;
    this.clientRequestId = details.clientRequestId ?? null;
    this.headers = details.headers;
    this.body = details.body;
  }

  /** Whether trying the same call again later can succeed (rate limits, server errors, network trouble). */
  get retryable(): boolean {
    if (this.code === ErrorCode.idempotencyInProgress) return true;
    // Search not set up is for good; the provider rate limiting the platform says when to come back.
    if (this.code === ErrorCode.searchUnavailable) return retryAfterSeconds(this.headers) !== null;
    if (NOT_RETRYABLE.has(this.code)) return false;
    return this.status === 429 || (this.status >= 500 && this.status !== 501);
  }
}

/** 429: too many requests (`rate_limited`) or all of the plan's concurrent sessions in use (`concurrency_limit`). */
export class RateLimitError extends BoxlineError {
  /** Seconds the server asked to wait (Retry-After), when it said. */
  readonly retryAfter: number | null;
  constructor(status: number, code: string, message: string, details: ErrorDetails = {}) {
    super(status, code, message, details);
    this.name = "RateLimitError";
    this.retryAfter = retryAfterSeconds(details.headers);
  }
}
/** 402 `feature_not_in_plan`: the project's plan does not include this. */
export class FeatureNotInPlanError extends BoxlineError {
  override name = "FeatureNotInPlanError";
}
/** 403 `project_suspended`: an admin suspended the project; the message says why. */
export class ProjectSuspendedError extends BoxlineError {
  override name = "ProjectSuspendedError";
}
/**
 * 422 `idempotency_mismatch`: this Idempotency-Key was already used for a different request (another body or route),
 * or, for a new API key, by another caller (another API key or console login).
 */
export class IdempotencyMismatchError extends BoxlineError {
  override name = "IdempotencyMismatchError";
}
/** 409 `idempotency_in_progress`: the first request with this key is still being answered (retried automatically). */
export class IdempotencyInProgressError extends BoxlineError {
  override name = "IdempotencyInProgressError";
}
/** 400 `invalid_cursor`: `after` is not a `next` value of that list. */
export class InvalidCursorError extends BoxlineError {
  override name = "InvalidCursorError";
}
/** `captcha_timeout`: a CAPTCHA kept waiting for a person (a plain-English step, or waitForHuman). */
export class CaptchaTimeoutError extends BoxlineError {
  override name = "CaptchaTimeoutError";
}
/** 502 `page_unreachable` (fetch, screenshot, pdf, extract): the page could not be loaded; the message says why. */
export class PageUnreachableError extends BoxlineError {
  override name = "PageUnreachableError";
}
/** 504 `page_timeout` (fetch, screenshot, pdf, extract): the page did not finish loading within `timeoutMs`. */
export class PageTimeoutError extends BoxlineError {
  override name = "PageTimeoutError";
}
/** 422 `not_a_web_page` (fetch, extract, search, crawl): the address is a file Chrome only displays (a PDF), with no page text. */
export class NotAWebPageError extends BoxlineError {
  override name = "NotAWebPageError";
}
/** 422 `model_refused` (extract): the model declined to extract from these pages. */
export class ModelRefusedError extends BoxlineError {
  override name = "ModelRefusedError";
}
/**
 * 503 `search_unavailable`: web search is not set up on this server, or its provider did not answer or is limiting
 * the platform (then `retryable`, with Retry-After).
 */
export class SearchUnavailableError extends BoxlineError {
  override name = "SearchUnavailableError";
}
/** 400 `out_of_viewport`: a mouse action's point is outside the page (or the computer-use screenshot). */
export class OutOfViewportError extends BoxlineError {
  override name = "OutOfViewportError";
}
/** 400 `webhook_url_not_allowed`: webhook endpoints must be public HTTPS addresses (the message says what is wrong). */
export class WebhookUrlNotAllowedError extends BoxlineError {
  override name = "WebhookUrlNotAllowedError";
}
/** 503 `webhooks_unavailable`: webhook delivery is not set up on this server. */
export class WebhooksUnavailableError extends BoxlineError {
  override name = "WebhooksUnavailableError";
}
/** 409 `webhook_disabled`: the endpoint is switched off; turn it on (update enabled: true) first. */
export class WebhookDisabledError extends BoxlineError {
  override name = "WebhookDisabledError";
}
/** 409 `payload_expired`: the event's body is kept 7 days; that delivery can no longer be sent again. */
export class PayloadExpiredError extends BoxlineError {
  override name = "PayloadExpiredError";
}

/** 400 `variables_with_extensions`: an agent run with variables in a session with extensions (see allowWithExtensions). */
export class VariablesWithExtensionsError extends BoxlineError {
  override name = "VariablesWithExtensionsError";
}
/** 403 `extension_denied`: the operator does not allow this extension. */
export class ExtensionDeniedError extends BoxlineError {
  override name = "ExtensionDeniedError";
}
/** 403 `cross_site_request`: a console-login upload that did not come from the platform's own sites. */
export class CrossSiteRequestError extends BoxlineError {
  override name = "CrossSiteRequestError";
}
/** 400 `invalid_extension`: the zip is not an acceptable Manifest V3 extension (the message says why). */
export class InvalidExtensionError extends BoxlineError {
  override name = "InvalidExtensionError";
}
/** 413 `payload_too_large`: the body is larger than the route allows (an extension zip: 10 MB). */
export class PayloadTooLargeError extends BoxlineError {
  override name = "PayloadTooLargeError";
}
/** 409 `limit_reached`: the project has as many as it may (e.g. 100 extensions). */
export class LimitReachedError extends BoxlineError {
  override name = "LimitReachedError";
}
/** 400 `missing_variables`: a task run (or its schedule) has no value for a variable without a default; the message names them. */
export class MissingVariablesError extends BoxlineError {
  override name = "MissingVariablesError";
}
/**
 * `plan_limit`: the plan allows no more of this (402: tasks, schedules switched on, searches on Free, project
 * credentials beyond `maxCredentials`, a session longer than the plan allows); the message says the limit.
 */
export class PlanLimitError extends BoxlineError {
  override name = "PlanLimitError";
}
/**
 * 409 `too_many_credential_values`: the session already hides as many earlier credential values in its output as it can
 * (256 values or 256 KB); a session create, exec, agent run or step adding more is refused. Start a new session.
 */
export class TooManyCredentialValuesError extends BoxlineError {
  override name = "TooManyCredentialValuesError";
}
/** 409 `credential_exists`: the project has a credential with that name; change it with credentials.update. */
export class CredentialExistsError extends BoxlineError {
  override name = "CredentialExistsError";
}
/**
 * 400 `credential_not_for_ai` / `credential_not_for_shell`: the credential's scope does not allow this use (scope
 * "shell" is not for the AI; a credential goes into a shell only with scope "shell" or "all", or shell: true).
 */
export class CredentialNotAllowedError extends BoxlineError {
  override name = "CredentialNotAllowedError";
}
/**
 * `credential_code_timeout`: a password with `codeSource` "push" or "url" waited `codeTimeoutSeconds` and no fresh code
 * or sign-in link came (push one with `credentials.pushCode`, or answer your `codeUrl`). Thrown by `session.login`
 * and `session.typeCredential`; `boxline-otp` exits 1 with it.
 */
export class CredentialCodeTimeoutError extends BoxlineError {
  override name = "CredentialCodeTimeoutError";
}
/**
 * 400 `credential_link_wrong_site`: a sign-in link (pushed, or answered by `codeUrl`) is not on one of the
 * credential's sites, so it was not used (never opened).
 */
export class CredentialLinkWrongSiteError extends BoxlineError {
  override name = "CredentialLinkWrongSiteError";
}
/**
 * `credential_login_failed`: `session.login` could not sign in (the message says why: the run's last step). `runId` is
 * the short agent run that tried (`bx.agent.get(runId)` has its steps); null when the API did not say.
 */
export class CredentialLoginFailedError extends BoxlineError {
  override name = "CredentialLoginFailedError";
  runId: string | null = null;
}
/**
 * `credential_login_timeout`: `session.login` took longer than its limit (15 steps, plus the credential's
 * `codeTimeoutSeconds` when its codes come from your system), so the run was canceled. A kind of
 * CredentialLoginFailedError: `runId` is the run, and `bx.agent.get(runId)` shows where it stood.
 */
export class CredentialLoginTimeoutError extends CredentialLoginFailedError {
  override name = "CredentialLoginTimeoutError";
}
/** 400 `code_url_not_allowed`: a credential's `codeUrl` is not a public HTTPS address (the webhook address rules). */
export class CodeUrlNotAllowedError extends BoxlineError {
  override name = "CodeUrlNotAllowedError";
}
/**
 * 409 `machine_too_old`: the session's machine comes from an image older than the API (during a deploy) and cannot take
 * `env` or `credentials`; start a new session.
 */
export class MachineTooOldError extends BoxlineError {
  override name = "MachineTooOldError";
}

/**
 * 409 `not_continuable`: agent.continueRun on a run that did not stop at one of its limits, was already continued (the
 * message names the run that did), or whose continue window has passed.
 */
export class NotContinuableError extends BoxlineError {
  override name = "NotContinuableError";
}
/** 409 `too_many_messages`: a run takes at most 50 messages (agent.sendMessage). */
export class TooManyMessagesError extends BoxlineError {
  override name = "TooManyMessagesError";
}
/**
 * 409 `run_not_live`: agent.takeover, handBack or sendMessage on a run whose API server stopped (a restart, a deploy):
 * no loop is left to act on it. Continue it (agent.continueRun) once it shows as failed with `server_restarted`.
 */
export class RunNotLiveError extends BoxlineError {
  override name = "RunNotLiveError";
}
/** 409 `session_not_running`: the session has ended (an agent run started or continued in it, a command, …). */
export class SessionNotRunningError extends BoxlineError {
  override name = "SessionNotRunningError";
}

/** Why verifyWebhook refused a delivery. */
export type WebhookSignatureFailure = "malformed" | "timestamp_out_of_range" | "no_matching_signature";

/**
 * verifyWebhook refused a delivery (not an API error: answer the sender 400). `reason`: the Boxline-Signature header
 * is missing or malformed, its timestamp is too far from now (a replay), or no signature matches the secret(s).
 */
export class WebhookSignatureError extends BoxlineError {
  readonly reason: WebhookSignatureFailure;
  constructor(reason: WebhookSignatureFailure, message: string) {
    super(400, ErrorCode.invalidSignature, message);
    this.name = "WebhookSignatureError";
    this.reason = reason;
  }
  override get retryable() {
    return false;
  }
}
/** 401: missing or invalid API key. */
export class AuthenticationError extends BoxlineError {
  override name = "AuthenticationError";
}
/** 404: no such thing in this project. */
export class NotFoundError extends BoxlineError {
  override name = "NotFoundError";
}
/** No response: the network failed or the server went away (retried automatically where safe). */
export class BoxlineConnectionError extends BoxlineError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(0, ErrorCode.connectionError, message, details);
    this.name = "BoxlineConnectionError";
  }
  override get retryable() {
    return true;
  }
}
/** The request took longer than its time limit (`timeoutMs`). */
export class BoxlineTimeoutError extends BoxlineConnectionError {
  constructor(message: string, details: ErrorDetails = {}) {
    super(message, details);
    (this as { code: string }).code = ErrorCode.timeout;
    this.name = "BoxlineTimeoutError";
  }
}

const BY_CODE: Record<string, typeof BoxlineError> = {
  [ErrorCode.rateLimited]: RateLimitError,
  [ErrorCode.concurrencyLimit]: RateLimitError,
  [ErrorCode.featureNotInPlan]: FeatureNotInPlanError,
  [ErrorCode.projectSuspended]: ProjectSuspendedError,
  [ErrorCode.idempotencyMismatch]: IdempotencyMismatchError,
  [ErrorCode.idempotencyInProgress]: IdempotencyInProgressError,
  [ErrorCode.invalidCursor]: InvalidCursorError,
  [ErrorCode.captchaTimeout]: CaptchaTimeoutError,
  [ErrorCode.pageUnreachable]: PageUnreachableError,
  [ErrorCode.pageTimeout]: PageTimeoutError,
  [ErrorCode.notAWebPage]: NotAWebPageError,
  [ErrorCode.modelRefused]: ModelRefusedError,
  [ErrorCode.searchUnavailable]: SearchUnavailableError,
  [ErrorCode.outOfViewport]: OutOfViewportError,
  [ErrorCode.webhookUrlNotAllowed]: WebhookUrlNotAllowedError,
  [ErrorCode.webhooksUnavailable]: WebhooksUnavailableError,
  [ErrorCode.webhookDisabled]: WebhookDisabledError,
  [ErrorCode.payloadExpired]: PayloadExpiredError,
  [ErrorCode.variablesWithExtensions]: VariablesWithExtensionsError,
  [ErrorCode.extensionDenied]: ExtensionDeniedError,
  [ErrorCode.crossSiteRequest]: CrossSiteRequestError,
  [ErrorCode.invalidExtension]: InvalidExtensionError,
  [ErrorCode.payloadTooLarge]: PayloadTooLargeError,
  [ErrorCode.limitReached]: LimitReachedError,
  [ErrorCode.missingVariables]: MissingVariablesError,
  [ErrorCode.planLimit]: PlanLimitError,
  [ErrorCode.tooManyCredentialValues]: TooManyCredentialValuesError,
  [ErrorCode.credentialExists]: CredentialExistsError,
  [ErrorCode.credentialNotForAi]: CredentialNotAllowedError,
  [ErrorCode.credentialNotForShell]: CredentialNotAllowedError,
  [ErrorCode.credentialCodeTimeout]: CredentialCodeTimeoutError,
  [ErrorCode.credentialLinkWrongSite]: CredentialLinkWrongSiteError,
  [ErrorCode.credentialLoginFailed]: CredentialLoginFailedError,
  [ErrorCode.credentialLoginTimeout]: CredentialLoginTimeoutError,
  [ErrorCode.codeUrlNotAllowed]: CodeUrlNotAllowedError,
  [ErrorCode.machineTooOld]: MachineTooOldError,
  [ErrorCode.notContinuable]: NotContinuableError,
  [ErrorCode.tooManyMessages]: TooManyMessagesError,
  [ErrorCode.runNotLive]: RunNotLiveError,
  [ErrorCode.sessionNotRunning]: SessionNotRunningError,
};
const BY_STATUS: Record<number, typeof BoxlineError> = { 401: AuthenticationError, 404: NotFoundError, 429: RateLimitError };

/** The error class for an API error: by its code first, then by its status. */
export function makeError(status: number, code: string, message: string, details: ErrorDetails = {}): BoxlineError {
  const Cls = BY_CODE[code] ?? BY_STATUS[status] ?? BoxlineError;
  return new Cls(status, code, message, details);
}

/** Retry-After in seconds (a number of seconds or an HTTP date); null when absent or unreadable. */
export function retryAfterSeconds(headers?: Headers): number | null {
  const v = headers?.get("retry-after");
  if (v === null || v === undefined || v.trim() === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, (at - Date.now()) / 1000);
}

/** Turns an error response into a typed error. The body is read here (it is small JSON); this never throws. */
export async function errorFromResponse(res: Response, method: string, path: string, sentClientId?: string): Promise<BoxlineError> {
  let body: unknown;
  let code = "http_error";
  let message = `${method} ${path.split("?")[0]} failed with ${res.status}`;
  let requestId: string | null = res.headers.get("x-request-id");
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : undefined;
    const err = (body as { error?: { code?: unknown; message?: unknown; requestId?: unknown } } | undefined)?.error;
    if (typeof err?.code === "string") code = err.code;
    if (typeof err?.message === "string") message = err.message;
    if (typeof err?.requestId === "string") requestId = err.requestId;
  } catch {
    /* not JSON (a proxy's error page), or the body could not be read: keep the generic message */
  }
  const clientRequestId = res.headers.get("x-client-request-id") ?? sentClientId ?? null;
  return makeError(res.status, code, message, { requestId, clientRequestId, headers: res.headers, body });
}
