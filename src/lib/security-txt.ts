/**
 * security.txt (RFC 9116): куди писати про знайдену вразливість. Адреса — та сама, що на «Про сайт»
 * (SITE_CONTACT_EMAIL, маска hello@ на домені), у коді її немає. Expires обов'язковий і має бути не далі року:
 * рахуємо від моменту генерації, сторінка оновлюється раз на добу (ISR), тож термін не «застаріває».
 */
export const SECURITY_TXT_TTL_DAYS = 180;

export function securityTxt(contact: string | null, origin: string, now: Date = new Date()): string | null {
  if (!contact) return null;
  const expires = new Date(now.getTime() + SECURITY_TXT_TTL_DAYS * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: uk, en",
    `Canonical: ${new URL("/.well-known/security.txt", origin).href}`,
    "",
  ].join("\n");
}
