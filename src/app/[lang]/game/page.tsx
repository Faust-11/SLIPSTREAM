import type { Metadata } from "next";
import { HotLap, type TrackCard } from "@/components/game/hot-lap";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { requireLocale } from "@/i18n/require-locale";
import { TRACK_KEYS, TRACK_SPECS, fmtLap } from "@/lib/game/physics";
import { trackThumb } from "@/lib/game/thumb";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  return pageMetadata({ locale: lang, path: "/game", title: dict.gamePage.title, description: dict.gamePage.metaDescription });
}

/** 1,30 км (uk) / 1.30 km (en); ширина — 14 м / 13 м. */
const dec = (v: string, lang: Locale) => (lang === "uk" ? v.replace(".", ",") : v);

export default async function GamePage({ params }: Props) {
  const lang = requireLocale((await params).lang);
  const dict = await getDictionary(lang);
  const L = dict.gamePage;
  const cards: TrackCard[] = TRACK_KEYS.map((key) => {
    const t = TRACK_SPECS[key];
    return {
      key,
      ...trackThumb(key),
      length: `${dec((t.len / 1000).toFixed(2), lang)} ${L.km}`,
      width: `${dec(String(t.HW * 2), lang)} ${L.m}`,
      bot: fmtLap(t.botTicks),
    };
  });

  return (
    <>
      <section className="gm-hero">
        <div className="wrap">
          <div>
            <span className="gm-stamp">{L.stamp}</span>
            <h1 className="display">
              {L.title} <span>{L.titleSub}</span>
            </h1>
            <p className="gm-lead">{L.lead}</p>
          </div>
          <ol className="gm-how">
            <li>{L.how.a}</li>
            <li>{L.how.b}</li>
            <li>{L.how.c}</li>
          </ol>
        </div>
      </section>
      <HotLap cards={cards} labels={L} locale={lang} />
    </>
  );
}
