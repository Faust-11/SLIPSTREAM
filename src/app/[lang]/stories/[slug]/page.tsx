import type { Metadata } from "next";
import { StoryView } from "@/components/stories/story-view";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { requireLocale } from "@/i18n/require-locale";
import { clipDescription, pageMetadata } from "@/lib/seo";
import { getStory, getStorySlugs } from "@/lib/stories/content";
import { raceFacts } from "@/lib/stories/race-facts";

type Props = { params: Promise<{ lang: string; slug: string }> };

// 33 історії × 2 мови — статично; невідомий slug — 404 без рендеру на запит (правило проєкту).
export const dynamicParams = false;
export function generateStaticParams() {
  return locales.flatMap((lang) => getStorySlugs().map((slug) => ({ lang, slug })));
}

async function load(props: Props) {
  const { lang: raw, slug } = await props.params;
  const lang = requireLocale(raw);
  const story = getStory(slug, lang);
  if (!story) throw new Error(`Історія ${slug}: немає в content/stories`);
  const dict = await getDictionary(lang);
  const facts = story.race ? await raceFacts(story.race.year, story.race.round, lang) : null;
  return { lang, story, dict, facts };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { lang, story } = await load(props);
  return pageMetadata({
    locale: lang,
    path: `/stories/${story.slug}`,
    title: story.title.full,
    description: clipDescription(story.dek),
    image: story.hero ? { src: story.hero.src, alt: story.hero.alt } : undefined,
    article: { modified: story.checked },
  });
}

export default async function StoryPageRoute(props: Props) {
  const { lang, story, dict, facts } = await load(props);
  return <StoryView lang={lang} story={story} dict={dict} facts={facts} />;
}
