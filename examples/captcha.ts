/**
 * CAPTCHAs: by default ("ask") the platform notices a CAPTCHA waiting for a person and hands over; you get told, a
 * person solves it in the live view, and your code (or the agent) carries on. Only automate sites you are allowed to.
 *
 *   npx tsx examples/test-site.ts &      # its /captcha page has a stand-in widget
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/captcha.ts
 */
import { Boxline, CaptchaTimeoutError } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const session = await bx.sessions.create({ captcha: "ask", timeout: 300 });
const stop = session.onCaptcha(({ state, kind, url }) => console.log(`captcha ${state}: ${kind} on ${url}`));
try {
  await session.goto(`${site}/captcha`);
  await new Promise((r) => setTimeout(r, 5000)); // detection looks twice, about 2 s apart
  await session.refresh();
  const waiting = session.data.attention;
  console.log(waiting ? `waiting for a person: ${waiting.kind} (${waiting.state ?? "waiting"}); send them the live view (session.liveUrl)` : "no CAPTCHA seen");

  // Here the example site's stand-in widget is answered in its place (what a person's click does on a real one).
  await session.evaluate(`document.querySelector("[name=g-recaptcha-response]").value = "answered-by-a-person"`);
  await session.waitForHuman({ timeoutMs: 30_000 });
  console.log("solved; carrying on. attention =", session.data.attention);
} catch (err) {
  if (err instanceof CaptchaTimeoutError) console.log("nobody solved it in time:", err.message);
  else throw err;
} finally {
  stop();
  await session.release();
}
