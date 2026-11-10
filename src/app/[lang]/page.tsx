import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <main>
      <h1 className="display">{dict.site.name}</h1>
      <p>{dict.site.tagline}</p>
      {/* Тимчасово до шапки (Task 5). */}
      <ThemeToggle labels={dict.theme} />
    </main>
  );
}
