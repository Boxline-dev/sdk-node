/**
 * Ad and tracker blocking: a session with `blockAds: true` opens a page that asks five ad and tracker sites for files.
 * The machine's local proxy refuses those requests before they leave it (they cost no proxy data), and the session's
 * `blockedRequests` counts them. The count is collected from the machine about every 30 seconds, so this waits for it.
 *
 *   npx tsx examples/test-site.ts &      # its /ads page
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/block-ads.ts
 *
 * `blockAds` works on every plan, and on the quick APIs too: bx.fetch(url, { blockAds: true }), screenshot, pdf,
 * extract and crawl.start.
 */
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

// cookieBanners: "reject" is the default: consent banners are answered "Reject all" / "Necessary only", never accepted.
const session = await bx.sessions.create({ blockAds: true, cookieBanners: "reject", timeout: 300 });
try {
  console.log(`session ${session.id}: blockAds ${session.data.blockAds}, cookie banners "${session.data.cookieBanners}"`);
  const page = await session.goto(`${site}/ads`);
  console.log(`opened ${page.url}`);

  const until = Date.now() + 90_000;
  while (session.data.blockedRequests === 0 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 3000));
    await session.refresh();
  }
  console.log(`blocked requests: ${session.data.blockedRequests}`);

  // The session's log says which list entries were hit (the machine's most blocked, at most 10).
  const { data: events } = await session.events({ types: ["lifecycle"] });
  const report = events.findLast((e) => e.text === "ads and trackers blocked");
  const top = (report?.data?.top ?? []) as { domain: string; count: number }[];
  if (top.length) console.log(`most blocked: ${top.map((t) => `${t.domain} (${t.count})`).join(", ")}`);
} finally {
  await session.release();
}
