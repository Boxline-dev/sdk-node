/**
 * Credentials: a secret exported into a shell session (its length checked, its value hidden in the output), changed,
 * listed, audited and deleted; then a website password with a 2FA key, linked to a browser profile. The values are
 * random (or the well-known test key) and never printed.
 *
 *   BOXLINE_API_KEY=bxl_… npx tsx examples/credentials.ts
 */
import { randomBytes } from "node:crypto";
import { Boxline, FeatureNotInPlanError } from "@boxline/sdk";

const bx = new Boxline();
const name = `EXAMPLE_${randomBytes(3).toString("hex").toUpperCase()}`;
const value = randomBytes(24).toString("base64url");

await bx.credentials.create({ name, type: "secret", value, scope: "shell", description: "examples/credentials.ts" });
try {
  const s = await bx.sessions.create({ browser: false, shell: true, timeout: 120, env: { REGION: "eu" }, credentials: [name] });
  try {
    console.log(`session ${s.id} exports ${s.data.credentials?.join(", ")}; env ${s.data.env?.join(", ")}`);
    const length = await s.exec(`printenv ${name} | wc -c`);
    console.log(`the value is ${Number(length.stdout.trim()) - 1} characters long in the shell`);
    const echo = await s.exec(`echo $${name}`);
    console.log(`echo shows ${echo.stdout.trim()}: the value is hidden in the output`);
  } finally {
    await s.release();
  }
  await bx.credentials.update(name, { value: randomBytes(24).toString("base64url"), description: null });
  for await (const c of bx.credentials.list()) console.log(`credential ${c.name} (${c.type}): scope ${c.scope}, last used ${c.lastUsedAt ?? "never"}`);
} finally {
  await bx.credentials.delete(name);
}
for await (const e of bx.credentials.audit({ name })) console.log(`audit: ${e.at} ${e.action} by ${e.actor ?? e.usedBy?.type}`);

// A website password with a 2FA key, linked to a browser profile: sessions started with the profile (and the agent
// runs in them) can sign in again by themselves with %SHOP.username%, %SHOP.password% and %SHOP.otp%.
const shop = `EXAMPLE_SHOP_${randomBytes(3).toString("hex").toUpperCase()}`;
const profile = await bx.profiles.create({ name: "examples/credentials.ts" });
try {
  const password = await bx.credentials.create({
    name: shop,
    type: "password",
    origins: ["https://example.com"], // the only site the AI may type it on
    username: "ada@example.com",
    password: randomBytes(12).toString("base64url"),
    totpSecret: "JBSWY3DPEHPK3PXP", // a site's 2FA setup key (this one is the well-known test key)
  });
  console.log(`password ${password.name}: user ${password.username}, 2FA ${password.hasTotp ? "on" : "off"}`);
  const linked = await bx.profiles.update(profile.id, { credential: shop });
  console.log(`profile ${linked.id} signs in with ${linked.credential}`);
} catch (error) {
  if (!(error instanceof FeatureNotInPlanError)) throw error;
  console.log("password credentials are not in this plan (loginDetails)");
} finally {
  await bx.profiles.delete(profile.id);
  await bx.credentials.delete(shop).catch(() => undefined);
}
