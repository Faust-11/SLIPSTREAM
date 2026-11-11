/** Перший екран розділу «Команди»: назва + три числа зі знімка (як у макеті). */
export function TeamsIntro({
  title,
  factsLabel,
  facts,
}: {
  title: string;
  factsLabel: string;
  facts: { value: number; label: string }[];
}) {
  return (
    <section className="teams-intro">
      <div className="wrap">
        <h1 className="display">{title}</h1>
        <ul className="facts" aria-label={factsLabel}>
          {facts.map((f) => (
            <li key={f.label}>
              <b className="num">{f.value}</b> <span>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
