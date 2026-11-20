import { jsonLdHtml } from "@/lib/jsonld";

/** Структуровані дані сторінки (schema.org, JSON-LD). Приймає один об'єкт або масив — для кожного свій <script>. */
export function JsonLd({ data }: { data: unknown }) {
  const list = Array.isArray(data) ? data : [data];
  return (
    <>
      {list.map((item, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(item) }} />
      ))}
    </>
  );
}
