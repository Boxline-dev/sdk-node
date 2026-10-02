/**
 * Cursor pages: await a list for one page, or `for await` it for every item (the SDK follows `next`).
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/list-sessions.ts
 */
import { Boxline } from "@boxline/sdk";

const bx = new Boxline();
const tag = `example-${Date.now()}`;

const made = await Promise.all([1, 2, 3].map(() => bx.sessions.create({ timeout: 120, userMetadata: { tag } })));
console.log(`started ${made.length} sessions tagged ${tag}`);

const first = await bx.sessions.list({ q: tag, limit: 2 });
console.log(`first page: ${first.data.length} of ${first.total}, next page: ${first.hasNextPage() ? "yes" : "no"}`);

let n = 0;
for await (const s of bx.sessions.list({ q: tag, limit: 2 })) console.log(`  ${++n}. ${s.id} ${s.status} created ${s.data.createdAt}`);

for await (const page of first.iterPages()) console.log(`page with ${page.data.length} sessions, next = ${page.next ?? "null"}`);

const { results } = await bx.sessions.bulk("release", made.map((s) => s.id));
console.log(`released: ${results.filter((r) => r.ok).length}/${results.length}`);
