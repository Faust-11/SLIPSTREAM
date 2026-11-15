"use server";

import { redirect } from "next/navigation";
import { GitHub, RevertRefused, deployHookUrl, githubEnv, revertPublished } from "@/lib/admin/github";
import { requireAdmin } from "@/lib/admin/session";

/**
 * Дії «Огляду». Кожна — публічний POST (docs: server-actions.md, «Security»): спершу requireAdmin(), далі лише номер PR
 * з форми, решта — з GitHub. Результат — код у адресі (?r=…), текст повідомлення бере сторінка зі свого словника.
 */

export async function rollbackAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const number = Number(formData.get("pr"));
  const env = githubEnv();
  if (!env || !Number.isSafeInteger(number) || number <= 0) redirect("/admin?r=bad");
  let code = "revert-ok";
  try {
    await revertPublished(new GitHub(env), number);
  } catch (e) {
    code = e instanceof RevertRefused ? "revert-refused" : "revert-error";
  }
  redirect(`/admin?r=${code}`);
}

export async function deployAction(): Promise<void> {
  await requireAdmin();
  const url = deployHookUrl();
  if (!url) redirect("/admin?r=no-hook");
  let code = "deploy-ok";
  try {
    const res = await fetch(url, { method: "POST", cache: "no-store" });
    if (!res.ok) code = "deploy-error";
  } catch {
    code = "deploy-error";
  }
  redirect(`/admin?r=${code}`);
}
