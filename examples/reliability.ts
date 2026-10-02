/**
 * What the SDK does for you when things go wrong: retries with backoff (GETs, and creates that carry an
 * Idempotency-Key), time limits, typed errors with request ids.
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/reliability.ts
 */
import { Boxline, BoxlineError, IdempotencyMismatchError, NotFoundError, RateLimitError } from "@boxline/sdk";

// Retries: 2 by default; timeoutMs per request (120 s by default).
const bx = new Boxline({ maxRetries: 3, timeoutMs: 60_000 });

// A create with your own Idempotency-Key: safe to send again (a crash, a timeout); it never starts a second session.
const key = `nightly-job-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
const a = await bx.sessions.create({ timeout: 120, userMetadata: { job: "nightly" } }, { idempotencyKey: key });
const b = await bx.sessions.create({ timeout: 120, userMetadata: { job: "nightly" } }, { idempotencyKey: key });
console.log(`same key, same session: ${a.id === b.id}`);
try {
  await bx.sessions.create({ timeout: 300 }, { idempotencyKey: key });
} catch (err) {
  if (err instanceof IdempotencyMismatchError) console.log(`another body with that key: ${err.code}`);
  else throw err;
}
await a.release();

// Your own id for a request, to find it in your logs and ours; the API's id is error.requestId.
try {
  await bx.sessions.get("00000000-0000-4000-8000-000000000000", { clientRequestId: "my-trace-42", maxRetries: 0 });
} catch (err) {
  if (err instanceof NotFoundError) console.log(`${err.status} ${err.code}: ${err.message} (requestId ${err.requestId}, clientRequestId ${err.clientRequestId})`);
  else throw err;
}

// Every error is a BoxlineError; rate limits say how long to wait.
try {
  await bx.me({ timeoutMs: 1 }); // far too short, on purpose
} catch (err) {
  if (err instanceof RateLimitError) console.log(`slow down for ${err.retryAfter} s`);
  else if (err instanceof BoxlineError) console.log(`${err.name} (${err.code}), retryable: ${err.retryable}`);
  else throw err;
}
