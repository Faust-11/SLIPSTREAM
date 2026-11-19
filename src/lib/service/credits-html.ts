import type { SiteCredit } from "@/lib/data/credits";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ESC[c]!);

/** Рядки переліку авторів як HTML (усі значення екрановано; посилання — лише https). Розмітка та сама, що була в JSX. */
export function creditsHtml(credits: SiteCredit[], kinds: Record<SiteCredit["kind"], string>): string {
  return credits
    .map((c) => {
      const href = c.href.startsWith("https://") ? esc(c.href) : "#";
      const alt = c.alt ? ` data-alt="${esc(c.alt)}"` : "";
      return `<li${alt}><span class="sv-kind">${esc(kinds[c.kind])}</span> <a href="${href}" rel="noopener">${esc(c.label)}</a> <span class="sv-by">— <span translate="no">${esc(c.author)}</span>, ${esc(c.license)}</span></li>`;
    })
    .join("");
}
