"use client";

import { useSelectedLayoutSegments } from "next/navigation";
import { activeNavKey } from "@/config/nav";

/**
 * Активний розділ — з дерева маршрутів, а не з URL: при rewrites (`/teams` → `/en/teams`)
 * `usePathname()` на статичних сторінках дає розбіжність гідратації (docs: use-pathname.md).
 */
export function useActiveNav() {
  return activeNavKey(useSelectedLayoutSegments());
}
