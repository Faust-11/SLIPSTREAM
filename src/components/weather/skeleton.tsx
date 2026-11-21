/** Заглушка компактного блока погоди: заголовок, n рядків і підпис джерел — тієї ж висоти, що готовий блок (без зсуву розкладки). */
export function WeatherSkeleton({ n, label }: { n: number; label?: string }) {
  return (
    <div className="ww ww-wait" aria-busy="true">
      {label && <p className="sr-only">{label}</p>}
      <span className="ww-sk ww-sk-h" aria-hidden="true" />
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="ww-sk ww-sk-r" aria-hidden="true" />
      ))}
      <span className="ww-sk ww-sk-c" aria-hidden="true" />
    </div>
  );
}
