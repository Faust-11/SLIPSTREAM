import Link from "next/link";
import { ROUNDEL_SVG } from "./roundel-svg";

/** Роундел S + назва. `label` — доступна назва посилання (напр. «Outlap — головна»). */
export function Brand({ href, label, name }: { href: string; label: string; name: string }) {
  return (
    <Link className="brand" href={href} aria-label={label}>
      <span className="roundel" aria-hidden="true">
        <svg viewBox="0 0 64 64" dangerouslySetInnerHTML={{ __html: ROUNDEL_SVG }} />
      </span>
      <b translate="no">{name}</b>
    </Link>
  );
}
