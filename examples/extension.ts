/**
 * A Chrome extension in a session: build a tiny Manifest V3 extension (a content script that changes the page's
 * title) as a zip, upload it once, start a session with it, and read the title the page ends up with.
 *
 *   npx tsx examples/test-site.ts &
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/extension.ts
 *
 * Needs the plan feature `extensions`. An extension sees every page and every value typed into the sessions that use
 * it, and can send them anywhere: upload only extensions you trust, and keep secrets in sessions without extensions.
 * A zip file on disk works too: bx.extensions.upload("./my-extension.zip").
 */
import { Boxline, FeatureNotInPlanError } from "@boxline/sdk";

const site = process.env.SITE_URL ?? "http://127.0.0.1:4800";
const bx = new Boxline();

// Least privilege: no permissions, and the content script runs on the example site's host only.
const { protocol, hostname } = new URL(site);
const zip = storedZip({
  "manifest.json": JSON.stringify(
    {
      manifest_version: 3,
      name: "Boxline title example",
      version: "1.0",
      description: "Prefixes the page title.",
      content_scripts: [{ matches: [`${protocol}//${hostname}/*`], js: ["title.js"], run_at: "document_end" }],
    },
    null,
    2,
  ),
  "title.js": 'document.title = "Changed by an extension: " + document.title;\n',
});

let ext;
try {
  ext = await bx.extensions.upload(zip);
} catch (err) {
  if (err instanceof FeatureNotInPlanError) {
    console.error("this project's plan has no extensions (plan feature `extensions`)");
    process.exit(1);
  }
  throw err; // InvalidExtensionError says what is wrong with the zip
}
console.log(`uploaded ${ext.id}: "${ext.name}" ${ext.version}, ${ext.files} files, ${ext.sizeBytes} bytes, permissions [${ext.permissions.join(", ")}]`);

try {
  const session = await bx.sessions.create({ extensions: [ext.id], timeout: 300 });
  try {
    console.log(`session ${session.id} with extensions [${session.data.extensions.join(", ")}]`);
    const loaded = (await session.events({ types: ["lifecycle"] })).data.find((e) => e.text === "extensions loaded");
    if (loaded) console.log(`extensions loaded in ${loaded.data?.ms} ms`);

    await session.goto(site);
    let title = await session.evaluate<string>("document.title");
    for (let i = 0; i < 10 && !title.startsWith("Changed"); i++) {
      await new Promise((r) => setTimeout(r, 300));
      title = await session.evaluate<string>("document.title");
    }
    console.log(`page title: ${title}`);
  } finally {
    await session.release();
  }
} finally {
  // Sessions already running with it keep it; new ones can't use it any more.
  await bx.extensions.delete(ext.id);
  console.log(`deleted ${ext.id}`);
}

/** A zip of text files, stored without compression: enough for a small extension, with no dependency. */
function storedZip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const DOS_DATE_1980_01_01 = 0x21;
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // local file header
    lh.setUint16(4, 20, true); // version needed: 2.0
    lh.setUint16(12, DOS_DATE_1980_01_01, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); // compressed size = size (stored)
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, path.length, true);
    local.push(new Uint8Array(lh.buffer), path, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); // central directory header
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(14, DOS_DATE_1980_01_01, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, path.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), path);
    offset += 30 + path.length + data.length;
  }
  const count = Object.keys(files).length;
  const size = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
