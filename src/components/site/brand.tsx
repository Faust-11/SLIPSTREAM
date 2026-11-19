import Link from "next/link";
import { Logo } from "./logo";

/** Логотип-посилання на головну. `label` — доступна назва посилання (напр. «Outlap — головна»). */
export function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link className="brand" href={href} aria-label={label}>
      <Logo />
    </Link>
  );
}
