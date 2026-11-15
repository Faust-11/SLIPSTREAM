import type { Locale } from "@/i18n/config";
import type { Meter as MeterData } from "@/lib/stories/content";
import { plural } from "@/lib/plural";

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type MeterLabels = { meterLabel: PluralForms; meterKeys: Record<"ok" | "one" | "dis", string> };

/**
 * Шкала перевірки (макет «Історії»): скільки тверджень і з якими статусами — у картці списку й у бічній колонці історії.
 * Смуга — лише ілюстрація (aria-hidden); те саме словами й числами — у підписах під нею (статус не лише кольором).
 */
export function Meter({ m, locale, t, compact = false }: { m: MeterData; locale: Locale; t: MeterLabels; compact?: boolean }) {
  const fmt = new Intl.NumberFormat(locale);
  return (
    <div className={compact ? "st-meter st-meter-sm" : "st-meter"}>
      <p className="st-mhead">
        <b className="display num">{fmt.format(m.total)}</b> <span>{plural(m.total, locale, t.meterLabel)}</span>
      </p>
      <div className="st-mbar" aria-hidden="true">
        {(["ok", "one", "dis"] as const).map((k) => (m[k] > 0 ? <i key={k} className={`st-${k}`} style={{ flexGrow: m[k] }} /> : null))}
      </div>
      <ul className="st-mkeys" role="list">
        {(["ok", "one", "dis"] as const).map((k) => (
          <li key={k}>
            <i className={`st-sw st-${k}`} aria-hidden="true" />
            <b className="num">{fmt.format(m[k])}</b> {t.meterKeys[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
