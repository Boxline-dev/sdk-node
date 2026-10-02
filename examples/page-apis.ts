/**
 * The page APIs: one call each, rendered in a real browser inside a sandbox (never on your computer or ours).
 *
 *   npx tsx examples/test-site.ts &      # or pass any public URL
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/page-apis.ts [url]
 */
import { writeFile } from "node:fs/promises";
import { Boxline, PageUnreachableError } from "@boxline/sdk";

const url = process.argv[2] ?? process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const page = await bx.fetch(url, { format: "markdown", links: true, delayMs: 200, viewport: { width: 1280, height: 800 } });
console.log(`fetch: ${page.status} "${page.title}", ${page.content.length} characters, ${page.links?.length ?? 0} links, CAPTCHA: ${page.captcha ?? "none"}`);

const png = await bx.screenshot(url, { fullPage: true });
await writeFile("page.png", png);
console.log(`screenshot: page.png (${png.length} bytes)`);

const pdf = await bx.pdf(url, { paper: "A4" });
await writeFile("page.pdf", pdf);
console.log(`pdf: page.pdf (${pdf.length} bytes)`);

const crawl = await bx.crawl.start({ url: new URL("/docs", url).href, maxPages: 5, maxDepth: 1 });
const done = await bx.crawl.wait(crawl.id, { pollMs: 500 });
console.log(`crawl: ${done.status}, ${done.data.length} pages: ${done.data.map((p) => p.title).join(", ")}`);

// extract needs a model on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY).
const models = await bx.agent.models();
if (models.providers.some((p) => p.available)) {
  const r = await bx.extract<{ title: string; links: number }>({
    url,
    schema: { type: "object", properties: { title: { type: "string" }, links: { type: "integer" } }, required: ["title", "links"] },
  });
  console.log(`extract (${r.model}):`, r.data, `$${r.usage.costUsd}`);
} else console.log("extract: skipped (no model provider is configured on this server)");

try {
  await bx.fetch("http://127.0.0.1:1/");
} catch (err) {
  if (err instanceof PageUnreachableError) console.log(`a page that cannot load: ${err.status} ${err.code}: ${err.message} (request ${err.requestId})`);
  else throw err;
}
