import { BlockList, isIP } from "node:net";

/**
 * Захист від SSRF для перевірки посилань (7c, задача 7). Адреси беремо з даних історій, але адмінка ходить за ними з
 * сервера: без захисту посилання на 169.254.169.254, localhost чи внутрішню мережу Vercel зробило б із кнопки сканер.
 * Правила: лише http(s) на стандартних портах, без логіна в адресі, лише публічні IP — перевіряється КОЖНЕ з'єднання
 * (у `lookup`, див. check.ts), а не лише перше: так працює і проти DNS rebinding, і проти редиректів у приватну мережу.
 */
const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], // «ця мережа»
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local: метадані хмари
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // зарезервовано + broadcast
] as const) {
  blocked.addSubnet(net, bits, "ipv4");
}
// IPv4-mapped (::ffff:127.0.0.1) окремим правилом НЕ блокуємо: BlockList Node трактує будь-який IPv4 як mapped, і правило
// ::ffff:0:0/96 заборонило б усі публічні адреси (замір 20.11). Mapped-адреса перевіряється правилами IPv4 вище.
for (const [net, bits] of [
  ["::", 128],
  ["::", 96], // IPv4-сумісні (::127.0.0.1) — застарілий формат, на публічних адресах не вживається
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48], // NAT64 локальний
  ["100::", 64],
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (застарілий, але маршрутизований всередині мереж)
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(net, bits, "ipv6");
}

/** Публічна ІР-адреса (єдина, на яку дозволено з'єднуватись). Не-ІР рядок — false. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type ParsedUrl = { ok: true; url: URL } | { ok: false; reason: string };

/** Адреса, яку можна перевіряти: http(s), без логіна, стандартний порт, ім'я не `localhost`/внутрішнє, літеральна ІР — публічна. */
export function parseCheckUrl(raw: string): ParsedUrl {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "некоректна адреса" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "не http(s)" };
  if (url.username || url.password) return { ok: false, reason: "логін у адресі" };
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) return { ok: false, reason: "нестандартний порт" };
  // «localhost.» — те саме ім'я з кореневою крапкою: без цього воно проходило б розбір (з'єднання його все одно відхиляє).
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  if (!host) return { ok: false, reason: "немає хоста" };
  if (isIP(host)) return isPublicAddress(host) ? { ok: true, url } : { ok: false, reason: "приватна адреса" };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    return { ok: false, reason: "внутрішнє ім'я" };
  }
  return { ok: true, url };
}
