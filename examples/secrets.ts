/**
 * Project secrets and saved login details: a secret exported into a shell session (its length checked, its value hidden
 * in the output), changed, listed, audited and deleted; then login details with 2FA on a saved login. The secret's
 * value is random and never printed.
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/secrets.ts
 */
import { randomBytes } from "node:crypto";
import { Boxline } from "@boxline/sdk";

const bx = new Boxline();
const name = `EXAMPLE_${randomBytes(3).toString("hex").toUpperCase()}`;
const value = randomBytes(24).toString("base64url");

await bx.secrets.create({ name, value, scope: "shell", description: "examples/secrets.ts" });
try {
  const s = await bx.sessions.create({ browser: false, shell: true, timeout: 120, env: { REGION: "eu" }, secrets: [name] });
  try {
    console.log(`session ${s.id} exports ${s.data.secrets?.join(", ")}; env ${s.data.env?.join(", ")}`);
    const length = await s.exec(`printenv ${name} | wc -c`);
    console.log(`the value is ${Number(length.stdout.trim()) - 1} characters long in the shell`);
    const echo = await s.exec(`echo $${name}`);
    console.log(`echo shows ${echo.stdout.trim()}: the value is hidden in the output`);
  } finally {
    await s.release();
  }
  await bx.secrets.update(name, { value: randomBytes(24).toString("base64url"), description: null });
  for await (const x of bx.secrets.list()) console.log(`secret ${x.name}: scope ${x.scope}, last used ${x.lastUsedAt ?? "never"}`);
} finally {
  await bx.secrets.delete(name);
}
for await (const e of bx.secrets.audit({ name })) console.log(`audit: ${e.at} ${e.action} by ${e.actor ?? e.usedBy?.type}`);

// Login details on a saved login: %login.username%, %login.password% and %login.otp% in sessions started with it.
const context = await bx.contexts.create({ name: "examples/secrets.ts" });
try {
  const withLogin = await bx.contexts.setLogin(context.id, {
    origin: "https://example.com",
    username: "ada@example.com",
    password: randomBytes(12).toString("base64url"),
    totpSecret: "JBSWY3DPEHPK3PXP", // a site's 2FA setup key (this one is the well-known test key)
  });
  console.log(`login details: ${JSON.stringify(withLogin.login)}`);
  await bx.contexts.deleteLogin(context.id);
} finally {
  await bx.contexts.delete(context.id);
}
