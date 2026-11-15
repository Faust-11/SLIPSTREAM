import type { ReactNode } from "react";

/**
 * Каркас службових сторінок (макет https://claude.ai/artifact/RyhHaGGWe7EkWMv6HP1smo): банер зі штампом, h1 у два
 * рядки, лід і ряд цифр; далі — зміст сторінки (липкий на широкому екрані) і текст розділами.
 */
export function ServiceHero({ stamp, h1, lead, facts }: { stamp: string; h1: string[]; lead: string; facts: { n: string; label: string }[] }) {
  return (
    <section className="sv-hero">
      <div className="wrap">
        <p className="sv-stamp">{stamp}</p>
        <h1 className="display">
          {h1[0]} <span>{h1[1]}</span>
        </h1>
        <p className="sv-lead">{lead}</p>
        <dl className="sv-facts">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="num">{f.n}</dt>
              <dd>{f.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function ServiceBody({ idxLabel, idx, children }: { idxLabel: string; idx: { id: string; label: string }[]; children: ReactNode }) {
  return (
    <div className="sv-body">
      <div className="wrap">
        <nav className="sv-idx" aria-label={idxLabel}>
          <p>{idxLabel}</p>
          <ul role="list">
            {idx.map((x) => (
              <li key={x.id}>
                <a href={`#${x.id}`}>{x.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sv-txt">{children}</div>
      </div>
    </div>
  );
}

export function ServiceSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="sv-sec">
      <h2 className="display" id={`${id}-h`}>
        {title}
      </h2>
      {children}
    </section>
  );
}
