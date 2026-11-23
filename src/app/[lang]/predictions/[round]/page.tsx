import type { Metadata } from "next";
import Link from "next/link";
import { PredictionApp } from "@/components/predictions/prediction-app";
import { PageCredits } from "@/components/teams/page-credits";
import { locales } from "@/i18n/config";
import { fill } from "@/i18n/fill";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";
import { requireLocale } from "@/i18n/require-locale";
import { SeasonPhoto } from "@/components/seasons/season-photo";
import { HERO_PHOTO } from "@/lib/hero-photo";
import { circuitMedia } from "@/lib/data/circuits";
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
  const circuitPhoto = (await circuitMedia(card.circuitSlug)).photo;
  // Траса без фото (Катар) — шапка з тією самою решіткою, що на списку й на головній: темна шапка всюди однакова.
  const photo = circuitPhoto
    ? { src: circuitPhoto.src, srcSet: circuitPhoto.srcSet, width: circuitPhoto.width, height: circuitPhoto.height, focus: circuitPhoto.focus as string | undefined }
    : { src: HERO_PHOTO.src, srcSet: HERO_PHOTO.srcSet, width: HERO_PHOTO.width, height: HERO_PHOTO.height, focus: undefined };
  const credit = circuitPhoto
    ? { label: card.place, href: circuitPhoto.credit.page, author: circuitPhoto.credit.author, license: circuitPhoto.credit.license }
    : HERO_PHOTO.credit;
  return (
    <div className="au-page">
      <section className="au-hero pd-hero pd-hero-photo">
        {/* Фото траси (або решітка) — фон шапки під темним градієнтом; автор і ліцензія — внизу сторінки. */}
        {/* Клієнтський компонент навмисно (див. список етапів): інакше prefetch маршруту передзавантажує фото на інших сторінках. */}
        <SeasonPhoto
          className="pd-hero-img"
          src={photo.src}
          srcSet={photo.srcSet}
          sizes="100vw"
          width={photo.width}
          height={photo.height}
          alt=""
          priority={false}
          eager
          style={{ objectPosition: photo.focus }}
        />
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
      <PageCredits
        groups={[
          {
            title: t.creditsPhotos,
            items: [credit],
          },
        ]}
      />
    </div>
  );
}
