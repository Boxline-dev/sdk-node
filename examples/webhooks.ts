/**
 * Webhook endpoints from the API side: find a receiver's endpoint, make an event (a session that ends), wait for its
 * delivery and read its attempt history, send it again (the receiver drops it as a duplicate), rotate the secret (the
 * receiver still verifies: for 24 hours deliveries carry the old signature too) and send a test.
 *
 *   npx tsx examples/webhook-receiver.ts --register &     # first
 *   BOXLINE_API_KEY=bxl_… BOXLINE_API_URL=http://localhost:8080 npx tsx examples/webhooks.ts [receiver URL]
 */
import { Boxline, type WebhookDelivery, type WebhookEndpoint } from "@boxline/sdk";

const url = process.argv[2] ?? "http://127.0.0.1:4900/webhooks";
const bx = new Boxline();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let endpoint: WebhookEndpoint | undefined;
for await (const w of bx.webhooks.list()) if (w.url === url) endpoint = w;
if (!endpoint) throw new Error(`no endpoint for ${url}: start the receiver with --register first`);
console.log(`endpoint ${endpoint.id}: ${endpoint.enabled ? "enabled" : `off (${endpoint.disabledReason})`}, events ${endpoint.events.join(", ")}`);

// An event: a session that ends.
const session = await bx.sessions.create({ timeout: 60, userMetadata: { from: "webhooks example" } });
await session.release();
console.log(`session ${session.id} ended (${session.data.endReason})`);

// Its delivery, once it has been answered.
let delivery: WebhookDelivery | undefined;
for (let i = 0; i < 60 && !delivery; i++) {
  const recent = await bx.webhooks.deliveries(endpoint.id, { limit: 20 }); // newest first: one page is enough
  delivery = recent.data.find((d) => d.eventType === "session.ended" && d.payload?.data.id === session.id && d.status !== "pending");
  if (!delivery) await sleep(500);
}
if (!delivery) throw new Error("the session.ended delivery did not arrive within 30 s");
console.log(`delivery ${delivery.id}: ${delivery.status}, HTTP ${delivery.responseStatus}, ${delivery.attempts} attempt(s), event ${delivery.eventId}`);
for (const a of delivery.history) console.log(`  attempt at ${a.at}: ${a.status ?? a.errorCode} in ${a.durationMs} ms`);

// The same event again: the receiver answers "duplicate".
const again = await bx.webhooks.retryDelivery(endpoint.id, delivery.id);
console.log(`sent again: ${again.status}, HTTP ${again.responseStatus}, answer "${again.responseBody}"`);

// A new secret; the receiver only knows the old one, which keeps signing for 24 hours.
const rotated = await bx.webhooks.rotateSecret(endpoint.id);
console.log(`secret rotated at ${rotated.secretRotatedAt}; the old one signs until ${rotated.previousSecretExpiresAt} (the new secret is in this response only)`);

const test = await bx.webhooks.test(endpoint.id);
console.log(`test: ${test.status}, HTTP ${test.responseStatus} in ${test.durationMs} ms`);

let delivered = 0;
for await (const _ of bx.webhooks.deliveries(endpoint.id, { status: "delivered" })) delivered++;
console.log(`${delivered} delivered deliveries on this endpoint`);
