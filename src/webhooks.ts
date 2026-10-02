/**
 * Verifying webhook deliveries (docs/CONTRACT.md "Webhooks", "Signatures"). Every delivery carries
 *
 *   Boxline-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">[,v1=…]
 *
 * keyed with the endpoint's secret (the whole `whsec_…` string as UTF-8); for 24 hours after a rotation a second v1
 * signed with the old secret follows. verifyWebhook accepts and refuses exactly what the API's reference
 * (apps/api/src/webhooks/signing.ts) does; tests/unit/sdk-webhooks.test.ts checks it against vectors from that signer.
 *
 * HMAC-SHA256 is computed here without node:crypto or Web Crypto, so the check is synchronous and works the same in
 * Node 18+, Deno, Bun, edge runtimes and browsers.
 */
import { WebhookSignatureError, type WebhookSignatureFailure } from "./errors.js";
import type { WebhookEvent } from "./types.js";

export const WEBHOOK_SIGNATURE_HEADER = "Boxline-Signature";
/** How far a delivery's timestamp may be from the receiver's clock (seconds). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

// ---------------------------------------------------------------- HMAC-SHA256 (FIPS 180-4, RFC 2104)

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function sha256(data: Uint8Array): Uint8Array {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const blocks = Math.ceil((data.length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(data.length / 0x20000000)); // bit length, high word
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0); // bit length, low word
  const W = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15]!, 7) ^ rotr(W[i - 15]!, 18) ^ (W[i - 15]! >>> 3);
      const s1 = rotr(W[i - 2]!, 17) ^ rotr(W[i - 2]!, 19) ^ (W[i - 2]! >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const t1 = (h! + (rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + K[i]! + W[i]!) >>> 0;
      const t2 = ((rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a!) >>> 0;
    H[1] = (H[1]! + b!) >>> 0;
    H[2] = (H[2]! + c!) >>> 0;
    H[3] = (H[3]! + d!) >>> 0;
    H[4] = (H[4]! + e!) >>> 0;
    H[5] = (H[5]! + f!) >>> 0;
    H[6] = (H[6]! + g!) >>> 0;
    H[7] = (H[7]! + h!) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]!);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const inner = block.map((b) => b ^ 0x36);
  const outer = block.map((b) => b ^ 0x5c);
  return sha256(concat(outer, sha256(concat(inner, message))));
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Raw body bytes: a string is taken as UTF-8, like the API's signer does. */
function bodyBytes(body: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof body === "string") return utf8(body);
  return body instanceof Uint8Array ? body : new Uint8Array(body);
}

/** hex HMAC-SHA256 of `${timestamp}.${body}`, keyed with the secret string. */
function signature(secret: string, timestamp: number, body: Uint8Array): string {
  return toHex(hmacSha256(utf8(secret), concat(utf8(`${timestamp}.`), body)));
}

/** Compares two strings of equal length without stopping at the first difference. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------- the header

/** Reads `t=…,v1=…[,v1=…]` exactly as the API does; other keys are ignored. null when there is no usable t or v1. */
function parseHeader(header: unknown): { timestamp: number; v1: string[] } | null {
  if (typeof header !== "string" || header.length > 4096) return null;
  let timestamp: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) v1.push(value);
  }
  return timestamp !== null && v1.length ? { timestamp, v1 } : null;
}

export interface VerifyWebhookOptions {
  /** How far the signature's timestamp may be from now, in seconds (default 300). */
  toleranceSeconds?: number;
  /** "Now" in milliseconds (default Date.now()), for tests. */
  now?: number;
}

function failure(reason: WebhookSignatureFailure, tolerance: number, several: boolean): WebhookSignatureError {
  const message =
    reason === "malformed"
      ? `the ${WEBHOOK_SIGNATURE_HEADER} header is missing or malformed`
      : reason === "timestamp_out_of_range"
        ? `the ${WEBHOOK_SIGNATURE_HEADER} timestamp is more than ${tolerance % 60 === 0 ? `${tolerance / 60} minutes` : `${tolerance} seconds`} from now`
        : `no signature matches ${several ? "these secrets" : "this secret"} (check the secret, and that the body is the raw bytes as received)`;
  return new WebhookSignatureError(reason, message);
}

/**
 * Checks a webhook delivery and returns its event (the parsed body); throws WebhookSignatureError otherwise.
 *
 * - `body`: the raw request body exactly as received (a Buffer, Uint8Array or string): re-serialised JSON will not
 *   match.
 * - `header`: the `Boxline-Signature` header.
 * - `secret`: the endpoint's `whsec_…` secret, or several (e.g. `[newSecret, oldSecret]` while you switch after a
 *   rotation): the delivery is accepted when any of them signed it.
 *
 * A delivery can arrive more than once: after verifying, drop an event `id` you have handled already.
 */
export function verifyWebhook<T = Record<string, unknown>>(
  body: string | Uint8Array | ArrayBuffer,
  header: string | null | undefined,
  secret: string | string[],
  opts: VerifyWebhookOptions = {},
): WebhookEvent<T> {
  const secrets = Array.isArray(secret) ? secret : [secret];
  const tolerance = opts.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  const parsed = parseHeader(header);
  if (!parsed) throw failure("malformed", tolerance, secrets.length > 1);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) throw failure("timestamp_out_of_range", tolerance, secrets.length > 1);
  const bytes = bodyBytes(body);
  let match = false;
  for (const s of secrets) {
    const want = signature(s, parsed.timestamp, bytes);
    // Every signature is compared, so the time taken does not say which one (or how much of it) matched.
    for (const got of parsed.v1) if (constantTimeEqual(got, want)) match = true;
  }
  if (!match) throw failure("no_matching_signature", tolerance, secrets.length > 1);
  // Kept byte for byte like the API's reference: a leading byte-order mark stays (and JSON.parse refuses it).
  const text = typeof body === "string" ? body : new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
  return JSON.parse(text) as WebhookEvent<T>;
}

/**
 * A `Boxline-Signature` value for `body`, as the API signs deliveries: for testing your own receiver. With several
 * secrets it has one v1 per secret, the first one first (as during a rotation).
 */
export function webhookSignatureHeader(secret: string | string[], body: string | Uint8Array | ArrayBuffer, timestamp = Math.floor(Date.now() / 1000)): string {
  const secrets = Array.isArray(secret) ? secret : [secret];
  if (!secrets.length) throw new Error("no signing secret");
  const bytes = bodyBytes(body);
  return [`t=${timestamp}`, ...secrets.map((s) => `v1=${signature(s, timestamp, bytes)}`)].join(",");
}
