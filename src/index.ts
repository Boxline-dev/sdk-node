/**
 * TypeScript SDK for Boxline: isolated cloud sessions with a Chrome browser, a bash shell and a shared disk, plus
 * web APIs (fetch, screenshot, pdf, extract, crawl, search), computer use, an AI agent and saved tasks. Works in Node 18+ and modern browsers (it
 * uses the global fetch). The wire format is docs/CONTRACT.md and docs/openapi.yaml.
 */
export {
  Boxline,
  Auth,
  ProjectSettings,
  ApiKeys,
  Sessions,
  SessionFiles,
  Profiles,
  Crawl,
  Agent,
  Tasks,
  Credentials,
  Webhooks,
  Extensions,
  DEFAULT_BASE_URL,
  type BoxlineOptions,
  type SessionPage,
  type WaitOptions,
} from "./client.js";
export { Session, type ClickOptions, type DragOptions } from "./session.js";
export { Page, PagePromise } from "./pagination.js";
export { IDEMPOTENT_POSTS, isIdempotentPost, RETRY, retryDelayMs, type RequestOptions } from "./core.js";
export {
  BoxlineError,
  RateLimitError,
  FeatureNotInPlanError,
  ProjectSuspendedError,
  IdempotencyMismatchError,
  IdempotencyInProgressError,
  InvalidCursorError,
  CaptchaTimeoutError,
  PageUnreachableError,
  PageTimeoutError,
  NotAWebPageError,
  ModelRefusedError,
  SearchUnavailableError,
  OutOfViewportError,
  WebhookUrlNotAllowedError,
  WebhooksUnavailableError,
  WebhookDisabledError,
  PayloadExpiredError,
  WebhookSignatureError,
  VariablesWithExtensionsError,
  ExtensionDeniedError,
  CrossSiteRequestError,
  InvalidExtensionError,
  PayloadTooLargeError,
  LimitReachedError,
  MissingVariablesError,
  PlanLimitError,
  TooManyCredentialValuesError,
  CredentialExistsError,
  CredentialNotAllowedError,
  CredentialCodeTimeoutError,
  CredentialLinkWrongSiteError,
  CredentialLoginFailedError,
  CredentialLoginTimeoutError,
  CodeUrlNotAllowedError,
  MachineTooOldError,
  NotContinuableError,
  TooManyMessagesError,
  RunNotLiveError,
  SessionNotRunningError,
  type WebhookSignatureFailure,
  AuthenticationError,
  NotFoundError,
  BoxlineConnectionError,
  BoxlineTimeoutError,
  ErrorCode,
  makeError,
} from "./errors.js";
export { verifyWebhook, webhookSignatureHeader, WEBHOOK_SIGNATURE_HEADER, WEBHOOK_TOLERANCE_SECONDS, type VerifyWebhookOptions } from "./webhooks.js";
export { VERSION } from "./version.js";
export type * from "./types.js";

export { Boxline as default } from "./client.js";
