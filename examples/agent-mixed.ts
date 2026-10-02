/**
 * An agent that uses the browser AND the shell in one run: it downloads a report in the browser, adds it up with
 * Python in the shell, writes output/total.txt, and types the total into the site's form. Each step is printed as it
 * streams (browser_* tools, then bash, then browser_* again); afterwards the file is read with the files API.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/agent-mixed.ts
 * Needs a model on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY) and shell sessions.
 */
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const run = await bx.agent.run({
  task:
    `Go to ${site} and download the report (the CSV link). With Python in the shell, add up the revenue column of ` +
    `downloads/report.csv and write the total with two decimals to output/total.txt. Then enter that total in the ` +
    `"Total revenue" field of the form on ${site}, press Send, and reply with the total and what the site answered.`,
  shell: true,
  keepSession: true, // keep the session afterwards, to read output/total.txt
  maxSteps: 30,
});
console.log(`run ${run.id} (${run.provider}/${run.model}) in session ${run.sessionId}`);

// Browser tools arrive as steps once they finish; a shell command arrives as `exec` when it starts, then its output.
let n = 0;
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "tool" && e.name !== "bash") console.log(`${String(++n).padStart(2)}. ${e.name}${e.isError ? " (error)" : ""}: ${JSON.stringify(e.input ?? {}).slice(0, 110)}`);
  else if (e.type === "exec") console.log(`${String(++n).padStart(2)}. bash: ${e.command.split("\n")[0]!.slice(0, 110)}`);
  else if (e.type === "output") process.stdout.write(`      | ${e.data.trim().split("\n").join("\n      | ")}\n`);
  else if (e.type === "done") console.log(`done: ${e.status}\n${e.result ?? e.error}`);
}

const session = await bx.sessions.get(run.sessionId);
try {
  console.log(`output/total.txt: ${(await session.files.readText("output/total.txt")).trim()}`);
} finally {
  await session.release();
}
