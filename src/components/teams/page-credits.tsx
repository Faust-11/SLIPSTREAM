export type CreditGroup = {
  title: string;
  items: { label: string; href: string; author: string; license: string }[];
};

/**
 * Автори й ліцензії фото сторінки — згорнуті переліки на темній поверхні одразу над футером
 * (правило: атрибуція лише внизу, без плашок на фото; CC BY / BY-SA вимагають автора й ліцензію).
 */
export function PageCredits({ groups }: { groups: CreditGroup[] }) {
  const shown = groups.filter((g) => g.items.length > 0);
  if (shown.length === 0) return null;
  return (
    <section className="page-credits" data-surface="dark">
      <div className="wrap">
        {shown.map((g) => (
          <details key={g.title}>
            <summary>{g.title}</summary>
            <ul>
              {g.items.map((it) => (
                <li key={it.href}>
                  <a href={it.href} rel="noopener" translate="no">
                    {it.label}
                  </a>
                  : <span translate="no">{it.author}</span>, {it.license}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
