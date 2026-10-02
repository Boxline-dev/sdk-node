/**
 * A saved task with structured output: books from one category of books.toscrape.com (a public demo shop made for
 * scraping practice), run with a variable, waited for, its result checked, its history listed, then changed and deleted.
 * Then one agent run with an output schema.
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/tasks.ts
 */
import { Boxline, type OutputSchema } from "@boxline/sdk";

interface Books {
  category: string;
  books: { title: string; price: number }[];
}

const BOOKS: OutputSchema = {
  type: "object",
  properties: {
    category: { type: "string" },
    books: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "object", properties: { title: { type: "string" }, price: { type: "number" } }, required: ["title", "price"] },
    },
  },
  required: ["category", "books"],
};

const bx = new Boxline();

const task = await bx.tasks.create({
  name: "Books by category",
  instruction:
    "Open https://books.toscrape.com, open the category %category% from the list on the left, and return the category's " +
    "name and the first 3 books on its page with their prices in pounds (a number, without the sign).",
  variables: [{ name: "category", default: "Travel", description: "A category of the site" }],
  output: BOOKS,
  maxSteps: 15,
});
console.log(`task ${task.id}: ${task.name}`);

try {
  const started = await bx.tasks.run<Books>(task.id, { variables: { category: "Poetry" } });
  console.log(`task run ${started.id} (agent run ${started.runId}): ${started.status}`);
  const done = await bx.tasks.waitForRun(started, { timeoutMs: 10 * 60_000 });
  console.log(`${done.status} in ${Math.round((done.durationMs ?? 0) / 1000)} s, $${done.usage.costUsd}: ${done.resultText}`);
  for (const b of done.result?.books ?? []) console.log(`  ${b.title}: £${b.price}`);

  for await (const r of bx.tasks.runs(task.id, { limit: 10 })) console.log(`history: ${r.id} ${r.status} ${JSON.stringify(r.variables)}`);

  const changed = await bx.tasks.update(task.id, { name: "Books by category (3)", maxSteps: null });
  console.log(`renamed to "${changed.name}"`);
} finally {
  await bx.tasks.delete(task.id);
  console.log(`deleted ${task.id}`);
}

// Structured output without a task: the answer's type is yours to name.
const run = await bx.agent.run({
  task: "Open https://books.toscrape.com and return the title and price (in pounds, a number) of the first book on the page.",
  output: { type: "object", properties: { title: { type: "string" }, price: { type: "number" } }, required: ["title", "price"] },
  maxSteps: 8,
});
const answer = await bx.agent.wait<{ title: string; price: number }>(run.id);
console.log(answer.status === "completed" ? `first book: ${answer.result?.title} at £${answer.result?.price}` : `${answer.status}: ${answer.errorCode ?? ""} ${answer.error}`);
