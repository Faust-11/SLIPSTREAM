import Link from "next/link";
import { lang } from "next/root-params";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { localizedPath } from "@/i18n/paths";

export default async function NotFound() {
  const value = await lang();
  const locale = isLocale(value) ? value : defaultLocale;
  const dict = await getDictionary(locale);

  return (
    <main>
      <h1>{dict.notFound.title}</h1>
      <Link href={localizedPath("/", locale)}>{dict.notFound.home}</Link>
    </main>
  );
}
