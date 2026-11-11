"use client";

import Link from "next/link";
import type { MenuItem } from "./mobile-menu";
import { useActiveNav } from "./use-active-nav";

export function MainNav({ items, label }: { items: readonly MenuItem[]; label: string }) {
  const active = useActiveNav();
  return (
    <nav className="nav" aria-label={label}>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              className={item.accent === "yellow" ? "is-accent" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
