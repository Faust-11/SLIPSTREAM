import { request, type FullConfig } from "@playwright/test";

/**
 * Обмін секрету Vercel Deployment Protection на cookie домену прев'ю (документований механізм
 * `x-vercel-set-bypass-cookie`). Cookie прив'язана до домену — на інші хости не йде.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!baseURL || !secret) return;
  const ctx = await request.newContext({ baseURL });
  const res = await ctx.get("/", {
    headers: { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" },
  });
  if (!res.ok()) throw new Error(`Vercel bypass: ${res.status()} на ${baseURL}`);
  await ctx.storageState({ path: "e2e/.auth/vercel.json" });
  await ctx.dispose();
}
