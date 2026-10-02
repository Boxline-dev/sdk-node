/**
 * An agent run with variables: the model sees %email% and %password%, never the values, and the password may only
 * be typed into fields on the site you name.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/agent-variables.ts
 * Needs a model on the server (ANTHROPIC_API_KEY or OPENAI_API_KEY).
 */
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const run = await bx.agent.run({
  task: `Open ${site}/login, sign in with %email% and %password%, and tell me the exact text that confirms who is signed in.`,
  maxSteps: 12,
  variables: {
    email: "ada@example.com",
    password: { value: "example-password", origins: [new URL(site).origin] },
  },
});
console.log(`run ${run.id} on ${run.provider}/${run.model}`);

for await (const event of bx.agent.stream(run.id)) {
  if (event.type === "tool") console.log(`  ${event.name} ${JSON.stringify(event.input)}`); // placeholders, never values
  else if (event.type === "text" && event.text) console.log(`  says: ${event.text.slice(0, 120)}`);
  else if (event.type === "done") console.log(`done: ${event.status}: ${event.result ?? event.error}`);
}

const final = await bx.agent.get(run.id);
console.log(`${final.steps.length} steps, ${final.usage.inputTokens + final.usage.outputTokens} tokens, $${final.usage.costUsd}`);
console.log("the stored run mentions the password:", JSON.stringify(final).includes("example-password") ? "yes (bug!)" : "no");
