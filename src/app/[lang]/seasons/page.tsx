import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

// Заготовка (Task 5): лише заголовок, щоб посилання меню вели на сторінку. Перший екран і метадані — Task 6.
export default async function Page({ params }: PageProps<"/[lang]/seasons">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  return (
    <div className="wrap">
      <h1 className="display">{dict.nav.seasons}</h1>
    </div>
  );
}
