/**
 * Web search: results with titles, URLs, snippets and dates; with `fetch`, the top pages as Markdown too (opened in a
 * sandboxed browser, like bx.fetch). The same search within an hour comes from the cache and is not counted. The
 * query text goes to the search provider: keep secrets and personal data out of it.
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/search.ts ["your query"]
 */
import { Boxline, SearchUnavailableError } from "@boxline/sdk";

const query = process.argv[2] ?? "playwright connectOverCDP";
const bx = new Boxline();

try {
  const r = await bx.search({ query, limit: 5, safeSearch: "strict" });
  console.log(`"${r.query}": ${r.results.length} results in ${r.ms} ms (cached: ${r.cached})`);
  for (const x of r.results) console.log(`- ${x.title}${x.siteName ? ` · ${x.siteName}` : ""}${x.publishedAt ? ` · ${x.publishedAt.slice(0, 10)}` : ""}\n  ${x.url}\n  ${x.snippet.slice(0, 110)}`);

  const withPages = await bx.search({ query, limit: 3, fetch: 2 });
  for (const x of withPages.results.filter((x) => x.content !== undefined)) {
    console.log(x.content ? `fetched ${x.page?.finalUrl}: HTTP ${x.page?.status}, ${x.content.length} characters of Markdown` : `could not open ${x.url}: ${x.error?.code}`);
  }

  const again = await bx.search({ query, limit: 5, safeSearch: "strict" });
  console.log(`the same search again: cached = ${again.cached}`);
  const usage = await bx.usage();
  console.log(`searches this month: ${usage.searches.count} ($${usage.searches.costUsd} beyond the plan's allowance)`);
} catch (err) {
  if (err instanceof SearchUnavailableError) console.log(`search is not set up on this server: ${err.message}`);
  else throw err;
}
