/**
 * Mouse, keyboard and computer use on a session's page: drag with selectors, hover, double-click, select-all and
 * type, the one-line result of every action, and computer-use actions in Anthropic's and OpenAI's shapes on a
 * scaled-down screenshot. Everything acts on the page through the browser, never on the machine's desktop.
 *
 *   npx tsx examples/test-site.ts &      # its /drag page
 *   BOXLINE_API_KEY=bxl_… BOXLINE_API_URL=http://localhost:8080 npx tsx examples/computer-use.ts
 */
import { writeFile } from "node:fs/promises";
import { Boxline } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

const s = await bx.sessions.create({ timeout: 300 }); // viewport 1280×720: coordinates are CSS pixels of it
const text = (id: string, what = "textContent") => s.evaluate<string>(`String(document.getElementById(${JSON.stringify(id)}).${what})`);
try {
  await s.goto(`${site}/drag`);

  // The mouse: drag the box into the zone (a selector means the element's centre), in 20 steps.
  const d = await s.mouse.drag("#box", "#zone", { steps: 20 });
  console.log(`drag (${d.from.x}, ${d.from.y}) → (${d.to.x}, ${d.to.y}): ${await text("status")}`);
  await s.hover("#menu");
  console.log(`hover: ${(await text("tip", "hidden")) === "false" ? "tooltip shown" : "tooltip hidden"}`);
  await s.click("#dbl", { count: 2 });
  console.log(`double click: ${await text("dbl")}; the pointer is at ${JSON.stringify(await s.cursor())}`);

  // The keyboard: select everything in the field and type over it.
  await s.click("#note");
  await s.keyboard.key("ControlOrMeta+A");
  await s.keyboard.type("replaced");
  console.log(`field: ${await text("note", "value")}`);

  // Every action says what it did; a bare string is a plain-English step (it needs a model on the server).
  const results = await s.actions([{ action: "move", x: 640, y: 400, steps: 5 }, { action: "scroll", deltaY: 200 }, { action: "key", keys: "Escape" }, "move the mouse over the Hover me button"]);
  for (const r of results) console.log(`  ${r.action}: ${r.text ?? r.error}`);

  // Computer use: actions exactly as a model's computer tool gives them, on a 640-pixel-wide screenshot (scale 0.5, so
  // the box's centre (140, 190) is (70, 95) and the zone's (460, 210) is (230, 105)).
  await s.goto(`${site}/drag`);
  const a = await s.computer({ action: "left_click_drag", start_coordinate: [70, 95], coordinate: [230, 105] }, { maxWidth: 640 });
  console.log(`anthropic ${a.action}: ${a.text} (${a.width}×${a.height}, scale ${a.scale}) → ${await text("status")}`);
  const o = await s.computer({ type: "move", x: 320, y: 180 }, { maxWidth: 640, cursor: true });
  console.log(`openai ${o.action}: ${o.text}; cursor (${o.cursor.x}, ${o.cursor.y}); "${o.title}"`);
  await writeFile("computer.png", Buffer.from(o.screenshot!, "base64"));
  console.log(`computer.png: the screen with the pointer drawn on it (${o.mimeType})`);
} finally {
  await s.release();
}
