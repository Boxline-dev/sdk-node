/**
 * An agent run in computer mode: the model works on screenshots with its provider's own computer-use tool (Claude's
 * computer tool, or OpenAI's), and each step shows its thought as it streams.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… BOXLINE_API_URL=http://localhost:8080 npx tsx examples/agent-computer.ts
 * Needs a model with computer use on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY).
 */
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

// A configured provider's model with computer use, its default model first.
const catalog = await bx.agent.models();
const pick = catalog.providers
  .filter((p) => p.available)
  .flatMap((p) => [...p.models].sort((a, b) => Number(b.default) - Number(a.default)).map((m) => ({ provider: p.id, ...m })))
  .find((m) => m.supportsComputerUse);
if (!pick) throw new Error("no model with computer use is configured on this server");
console.log(`computer use with ${pick.provider}/${pick.id} (tool ${pick.computerTool})`);

const run = await bx.agent.run({
  task: `Open ${site}/drag. Drag the blue box into the dashed zone, then tell me the status text shown below them.`,
  mode: "computer",
  provider: pick.provider,
  model: pick.id,
  maxSteps: 15,
});
for await (const e of bx.agent.stream(run.id)) {
  if (e.type === "thought") console.log(`  thinks: ${e.text}`);
  else if (e.type === "tool") console.log(`  ${e.name}: ${JSON.stringify(e.input).slice(0, 120)}`);
  else if (e.type === "done") console.log(`done: ${e.status}: ${e.result ?? e.error}`);
}
const done = await bx.agent.get(run.id);
console.log(`mode ${done.mode}, ${done.steps.length} steps, $${done.usage.costUsd}`);
await (await bx.sessions.get(done.sessionId)).release().catch(() => undefined);
