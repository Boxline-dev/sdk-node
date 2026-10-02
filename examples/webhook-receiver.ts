/**
 * A webhook receiver (Node's http module): it verifies every delivery's signature against the raw body, drops
 * events it has handled already (by the id inside the signed body: a delivery can arrive more than once), and
 * answers 2xx at once.
 *
 *   BOXLINE_WEBHOOK_SECRET=whsec_… npx tsx examples/webhook-receiver.ts
 *     The endpoint's secret; while you switch after a rotation, both: "whsec_new,whsec_old".
 *
 *   BOXLINE_API_KEY=bxl_… BOXLINE_API_URL=http://localhost:8080 npx tsx examples/webhook-receiver.ts --register
 *     Local development: registers http://127.0.0.1:4900/webhooks as an endpoint (the API needs WEBHOOKS_ALLOW_LOCAL=1;
 *     real endpoints are public HTTPS), keeps its secret in memory only, and deletes the endpoint on Ctrl-C.
 */
import { createServer } from "node:http";
import { Boxline, WEBHOOK_SIGNATURE_HEADER, WebhookSignatureError, verifyWebhook, type WebhookEvent } from "@boxline/sdk";

const port = Number(process.env.PORT ?? 4900);
const url = `http://127.0.0.1:${port}/webhooks`;
let secrets = (process.env.BOXLINE_WEBHOOK_SECRET ?? "").split(",").filter(Boolean);
let registered: { bx: Boxline; id: string } | null = null;

if (process.argv.includes("--register")) {
  const bx = new Boxline();
  const endpoint = await bx.webhooks.create({ url, events: ["session.ended", "agent_run.finished", "crawl.finished", "captcha.waiting", "webhook.disabled"], description: "webhook-receiver example" });
  secrets = [endpoint.secret]; // shown only in this response: kept in memory, never printed
  registered = { bx, id: endpoint.id };
  console.log(`[receiver] registered endpoint ${endpoint.id} for ${url} (${endpoint.events.join(", ")})`);
}
if (!secrets.length) throw new Error("set BOXLINE_WEBHOOK_SECRET, or pass --register");

// Event ids already handled. A real receiver keeps them in its database, next to what it did with the event.
const handled = new Set<string>();

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks") return void res.writeHead(404).end();
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks); // the raw bytes: parsing and re-serialising the JSON would break the signature
    let event: WebhookEvent;
    try {
      event = verifyWebhook(body, req.headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()] as string | undefined, secrets);
    } catch (err) {
      if (!(err instanceof WebhookSignatureError)) throw err;
      console.log(`[receiver] refused a delivery: ${err.reason}`);
      return void res.writeHead(400).end(err.reason);
    }
    const attempt = req.headers["boxline-attempt"];
    if (handled.has(event.id)) {
      console.log(`[receiver] duplicate ${event.type} ${event.id} (attempt ${attempt}): already handled, ignored`);
      return void res.writeHead(200).end("duplicate");
    }
    handled.add(event.id);
    if (handled.size > 10_000) handled.delete(handled.values().next().value!);
    const d = event.data as Record<string, unknown>;
    const what = event.type === "session.ended" ? `session ${d.id} ${d.status} (${d.endReason})` : event.type === "webhook.test" ? String(d.message) : JSON.stringify(d).slice(0, 100);
    console.log(`[receiver] verified ${event.type} ${event.id} (attempt ${attempt}, delivery ${req.headers["boxline-delivery-id"]}): ${what}`);
    res.writeHead(200).end("ok"); // answer fast; do slow work after answering (or queue it)
  });
});

server.listen(port, "127.0.0.1", () => console.log(`[receiver] listening on ${url}`));

const stop = async () => {
  if (registered) {
    await registered.bx.webhooks.delete(registered.id).catch(() => undefined);
    console.log(`[receiver] deleted endpoint ${registered.id}`);
  }
  server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
