"use client";

import Link from "next/link";
import { fill } from "@/i18n/fill";
import { useAccount } from "./account-store";

type Labels = { signIn: string; account: string; accountNick: string };

/**
 * Вхід / профіль у шапці. Іконка сталого розміру (без зсуву макета, коли з'являється нік) на широкому екрані; у мобільному
 * меню — той самий вузол із текстом. prefetch={false}: посилання є на кожній сторінці, а вхід потрібен рідко — зайвого завантаження не робимо (на Lighthouse це не впливало: розбіг між прогонами того ж коміту більший). Анонім і «завантажується» дають однакову розмітку (див. account-store).
 */
export function AccountLink({ labels, loginHref, profileHref, withText = false, className = "" }: {
  labels: Labels;
  loginHref: string;
  profileHref: string;
  withText?: boolean;
  className?: string;
}) {
  const account = useAccount();
  const user = account.status === "user";
  const nick = user ? account.nick : null;
  const name = user ? (nick ? fill(labels.accountNick, { nick }) : labels.account) : labels.signIn;
  return (
    <Link href={user ? profileHref : loginHref} prefetch={false} className={`au-link ${className}`.trim()} aria-label={withText ? undefined : name} data-state={user ? "user" : "anon"}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
      {withText ? <span className="au-link-text">{user ? (nick ?? labels.account) : labels.signIn}</span> : null}
    </Link>
  );
}
