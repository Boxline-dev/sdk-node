/**
 * Browser, shell and files in ONE session: Playwright downloads a CSV, Python in the session's shell adds up a column,
 * the files API reads the result, and the actions API types it into a form. The browser's downloads and the shell
 * share the same /workspace disk.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/mixed-download-process-fill.ts
 */
import { Boxline } from "@boxline/sdk";
import { chromium } from "playwright-core";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const session = await bx.sessions.create({ shell: true, timeout: 300 });
console.log(`session ${session.id}: browser + shell, workspace ${session.workspacePath}`);
try {
  // 1. The browser (Playwright over CDP): open the page and click the download link.
  const browser = await chromium.connectOverCDP(session.connectUrl!);
  const context = browser.contexts()[0]!;
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(site);
  await page.click("#download");

  // 2. Files: wait until the download has finished writing (downloads always land in <workspace>/downloads).
  const file = await session.files.waitFor("downloads/*.csv", 30_000);
  console.log(`downloaded ${file.path} (${file.size} bytes)`);

  // 3. The shell: Python adds up the revenue column and writes output/total.txt.
  const r = await session.exec(`mkdir -p output && python3 - <<'EOF'
import csv
with open("downloads/report.csv", newline="") as f:
    total = sum(float(row["revenue"]) for row in csv.DictReader(f))
with open("output/total.txt", "w") as out:
    out.write(f"{total:.2f}\\n")
print(f"total revenue: {total:.2f}")
EOF`);
  console.log(`python (exit ${r.exitCode}): ${r.stdout.trim()}`);

  // 4. Files again: read the result the shell wrote.
  const total = (await session.files.readText("output/total.txt")).trim();
  console.log(`output/total.txt: ${total}`);

  // 5. The actions API (same browser): fill the form and send it.
  const results = await session.actions([
    { action: "fill", selector: "#total", value: total },
    { action: "click", selector: "#send" },
    { action: "wait", selector: "#received" },
    { action: "evaluate", expression: "document.querySelector('#received').textContent" },
  ]);
  console.log(`the site says: ${results.at(-1)!.value}`);
  await browser.close();
} finally {
  await session.release();
}
