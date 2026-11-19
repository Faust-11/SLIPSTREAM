"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Розділи адмінки. Нові з'являються тут, коли готові (7b — Фото, 7c — Історії, 7d — решта). */
export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Огляд" },
  { href: "/admin/stories", label: "Історії" },
  { href: "/admin/photos", label: "Фото" },
  { href: "/admin/races", label: "Гонки" },
  { href: "/admin/system", label: "Система" },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="ad-nav" aria-label="Розділи адмінки">
      {ADMIN_SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={path === s.href || (s.href !== "/admin" && path.startsWith(`${s.href}/`)) ? "page" : undefined}>
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
