/**
 * Quickstart: a session, Playwright over CDP, and the actions API on the same browser.
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/quickstart.ts [url]
 */
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const url = process.argv[2] ?? process.env.SITE_URL ?? "https://example.com";
const bx = new Boxline(); // BOXLINE_API_KEY; BOXLINE_API_URL (default https://api.boxline.dev)

const session = await bx.sessions.create({ timeout: 300 });
console.log(`session ${session.id} (${session.status}); watch it live: ${session.liveUrl ? "liveUrl is set" : "no live view"}`);
try {
  // Playwright drives the session's browser directly. connectUrl is a signed URL: treat it like a password.
  const browser = await chromium.connectOverCDP(session.connectUrl!);
  const page = browser.contexts()[0]!.pages()[0] ?? (await browser.contexts()[0]!.newPage());
  await page.goto(url);
  console.log("Playwright sees:", await page.title());
  await browser.close(); // disconnects this client; the session keeps running

  // The actions API runs next to the same browser, one HTTP call per list of actions.
  const content = await session.content("markdown");
  console.log(`actions API sees: ${content.title} (${content.content.length} characters of markdown)`);
  const shot = await session.screenshot({ format: "png" });
  console.log(`screenshot: ${Buffer.from(shot.data, "base64").length} bytes of ${shot.mimeType}`);
} finally {
  await session.release();
  console.log("released:", session.status, session.data.endReason);
}
