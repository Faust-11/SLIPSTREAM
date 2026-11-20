import type { Metadata } from "next";
import Link from "next/link";
import "@/components/predictions/predictions.css";
import { PredictionApp } from "@/components/predictions/prediction-app";
import { locales } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { getPredictionsData } from "@/lib/data/predictions";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string; round: string }> };

// Усі етапи сезону (і минулі: там — лише перегляд чужих прогнозів); невідомий етап — 404 без рендеру на запит.
export const dynamicParams = false;
export async function generateStaticParams() {
  const data = await getPredictionsData("en");
  return locales.flatMap((lang) => data.rounds.map((r) => ({ lang, round: String(r.round) })));
}

async function load(props: Props) {
  const { lang: raw, round } = await props.params;
  const lang = requireLocale(raw);
  const [dict, data] = await Promise.all([getDictionary(lang), getPredictionsData(lang)]);
  const card = data.rounds.find((r) => String(r.round) === round);
  if (!card) throw new Error(`Етап ${round}: немає в календарі ${data.season}`);
  return { lang, dict, data, card };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, dict, card } = await load(props);
  const t = dict.predictions;
  // Оболонка сторінки порожня до відповіді API (дедлайн, гравці) — для пошуку це тонка сторінка: noindex, але з переходом за посиланнями.
  return {
    ...pageMetadata({
      locale: lang,
      path: `/predictions/${card.round}`,
      title: fill(t.round.metaTitle, { gp: card.gp }),
      description: fill(t.round.metaDescription, { gp: card.gp }),
    }),
    robots: { index: false, follow: true },
  };
}

export default async function PredictionRoundPage(props: Props) {
  const { lang, dict, data, card } = await load(props);
  const t = dict.predictions;
  const self = localizedPath(`/predictions/${card.round}`, lang);
  return (
    <div className="au-page">
      <section className="au-hero">
        <div className="wrap">
          <p className="au-stamp">{fill(t.round.stamp, { n: card.round, place: card.place })}</p>
          <h1 className="display">{card.gp}</h1>
          <p className="au-lead">{card.sprint ? t.round.sprintNote : t.lead}</p>
          <Link className="pd-back" href={localizedPath("/predictions", lang)}>
            ← {t.round.back}
          </Link>
        </div>
      </section>
      <div className="wrap au-body pd-body">
        <PredictionApp
          text={t}
          nickText={dict.auth.nick}
          locale={lang}
          year={data.season}
          round={card.round}
          deadlineAt={card.deadlineAt}
          drivers={data.drivers}
          teams={data.teams}
          loginHref={localizedPath("/login", lang)}
          selfHref={self}
        />
      </div>
    </div>
  );
}
