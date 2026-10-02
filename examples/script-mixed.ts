/**
 * A script that mixes Playwright, the shell and files inside the session: step() clicks the download in plain
 * English, child_process runs Python on the CSV, fs reads the result, and step() types it into the form.
 * useModel() picks the model for every step() in the script.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/script-mixed.ts
 * Needs shell sessions and a model on the server.
 */
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const catalog = await bx.agent.models();
const provider = catalog.providers.find((p) => p.available);
if (!provider) throw new Error("no model provider is configured on this server");
const fast = provider.id === "anthropic" ? "claude-haiku-4-5" : "gpt-6-luna";

// The script runs with Node inside the session, next to its browser; page, step() and useModel() are in scope.
const code = String.raw`
const { execSync } = require("child_process");
const fs = require("fs");
useModel(${JSON.stringify(fast)});

await page.goto(${JSON.stringify(site)});
await step("click the link that downloads the report");
for (let i = 0; i < 100 && !fs.existsSync("downloads/report.csv"); i++) await new Promise((r) => setTimeout(r, 200));
console.log("downloaded:", fs.statSync("downloads/report.csv").size, "bytes");

fs.mkdirSync("output", { recursive: true });
console.log(execSync("python3 -c \"import csv; t = sum(float(r['revenue']) for r in csv.DictReader(open('downloads/report.csv'))); open('output/total.txt', 'w').write(f'{t:.2f}'); print('python total', f'{t:.2f}')\"").toString().trim());
const total = fs.readFileSync("output/total.txt", "utf8").trim();

await step("type " + total + " into the total revenue field");
await step("press the Send button");
console.log("site:", await page.textContent("#received"));
`;

const session = await bx.sessions.create({ shell: true, timeout: 300 });
try {
  const r = await session.runScript(code, { timeoutMs: 180_000, onData: (_s, data) => process.stdout.write(data) });
  console.log(`exit ${r.exitCode} in ${r.durationMs} ms`);
  console.log(`output/total.txt (files API): ${(await session.files.readText("output/total.txt")).trim()}`);
} finally {
  await session.release();
}
