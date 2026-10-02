/**
 * A Playwright script run inside the session, with plain-English steps: useModel() picks the model for every later
 * step() and extract(); a call can still name its own.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/script-use-model.ts
 * Needs a session with a shell and a model on the server.
 */
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

// The fast step model of whichever provider this server has.
const catalog = await bx.agent.models();
const provider = catalog.providers.find((p) => p.available);
if (!provider) throw new Error("no model provider is configured on this server");
const fast = provider.id === "anthropic" ? "claude-haiku-4-5" : "gpt-6-luna";

const session = await bx.sessions.create({ shell: true, timeout: 300 });
try {
  const code = `
    useModel(${JSON.stringify(fast)});
    await page.goto(${JSON.stringify(site)});
    const typed = await step("type 3480.50 into the total revenue field");
    console.log("step:", typed.description, "->", typed.code);
    await step("choose Germany as the country");
    // Inside a script, extract() returns the data itself. It reads the page's text (typed values are not text).
    const links = await extract("the page heading and the text of each link", { type: "object", properties: { heading: { type: "string" }, links: { type: "array", items: { type: "string" } } } });
    console.log("extract:", JSON.stringify(links));
    await step("press the Send button");
    console.log("page:", await page.title(), "-", await page.textContent("#received"));
  `;
  const r = await session.runScript(code, { timeoutMs: 180_000, onData: (_stream, data) => process.stdout.write(data) });
  console.log(`exit ${r.exitCode} in ${r.durationMs} ms${r.timedOut ? " (timed out)" : ""}`);
} finally {
  await session.release();
}
