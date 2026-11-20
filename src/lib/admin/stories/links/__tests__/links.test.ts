// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkUrl, classify, fakeBase, safeLookup, type Transport } from "../check";
import { isPublicAddress, parseCheckUrl } from "../ssrf";

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"])("публічна: %s", (a) => expect(isPublicAddress(a)).toBe(true));
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // метадані хмари
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1", // IPv4 у вигляді IPv6
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "ff02::1",
    "не-адреса",
    "",
  ])("приватна чи не адреса: %s", (a) => expect(isPublicAddress(a)).toBe(false));
  it("сусіди приватних діапазонів — публічні (172.32, 100.128)", () => {
    expect(isPublicAddress("172.32.0.1")).toBe(true);
    expect(isPublicAddress("100.128.0.1")).toBe(true);
  });
});

describe("parseCheckUrl", () => {
  it("звичайні адреси з даних історій проходять", () => {
    expect(parseCheckUrl("https://www.fia.com/news/x?a=1#h").ok).toBe(true);
    expect(parseCheckUrl("http://example.com/").ok).toBe(true);
    expect(parseCheckUrl("https://example.com:443/").ok).toBe(true);
  });
  it.each([
    ["file:///etc/passwd", "не http(s)"],
    ["ftp://example.com/x", "не http(s)"],
    ["javascript:alert(1)", "не http(s)"],
    ["gopher://example.com", "не http(s)"],
    ["https://user:pw@example.com/", "логін у адресі"],
    ["https://example.com:8443/", "нестандартний порт"],
    ["http://example.com:22/", "нестандартний порт"],
    ["http://localhost/", "внутрішнє ім'я"],
    ["http://localhost./", "внутрішнє ім'я"], // коренева крапка — те саме ім'я
    ["http://intranet./", "внутрішнє ім'я"],
    ["http://127.0.0.1./", "приватна адреса"],
    ["http://[::7f00:1]/", "приватна адреса"], // IPv4-сумісна форма ::127.0.0.1
    ["http://[::a00:1]/", "приватна адреса"],
    ["http://[64:ff9b:1::1]/", "приватна адреса"],
    ["http://[fec0::1]/", "приватна адреса"],
    ["http://app.localhost/", "внутрішнє ім'я"],
    ["http://printer.local/", "внутрішнє ім'я"],
    ["http://metadata.internal/", "внутрішнє ім'я"],
    ["http://intranet/", "внутрішнє ім'я"],
    ["http://127.0.0.1/", "приватна адреса"],
    ["http://169.254.169.254/latest/meta-data/", "приватна адреса"],
    ["http://2130706433/", "приватна адреса"], // 127.0.0.1 десятковим числом — URL нормалізує
    ["http://0x7f.1/", "приватна адреса"],
    ["http://017700000001/", "приватна адреса"],
    ["http://[::1]/", "приватна адреса"],
    ["http://[::ffff:127.0.0.1]/", "приватна адреса"],
    ["not a url", "некоректна адреса"],
  ])("відхиляє %s", (u, reason) => expect(parseCheckUrl(u)).toEqual({ ok: false, reason }));
});

describe("classify", () => {
  it("2xx/3xx — працює; 404/410 — мертве; решта — не вдалося перевірити", () => {
    expect(classify(200).state).toBe("ok");
    expect(classify(304).state).toBe("ok");
    expect(classify(404).state).toBe("dead");
    expect(classify(410).state).toBe("dead");
    for (const s of [401, 403, 429, 500, 503, 0]) expect(classify(s).state).toBe("unknown");
  });
});

const hops = (...list: ({ status: number; location?: string } | Error)[]): { transport: Transport; seen: string[] } => {
  const seen: string[] = [];
  let i = 0;
  return {
    seen,
    transport: async (url) => {
      seen.push(url.href);
      const h = list[Math.min(i++, list.length - 1)]!;
      if (h instanceof Error) throw h;
      return h;
    },
  };
};

describe("checkUrl", () => {
  it("працює; мертве; не вдалося", async () => {
    expect((await checkUrl("https://a.example/x", hops({ status: 200 }).transport)).state).toBe("ok");
    expect((await checkUrl("https://a.example/x", hops({ status: 404 }).transport)).state).toBe("dead");
    expect((await checkUrl("https://a.example/x", hops({ status: 429 }).transport)).state).toBe("unknown");
  });
  it("іде за перенаправленням і повідомляє підсумкову адресу", async () => {
    const h = hops({ status: 301, location: "/new" }, { status: 200 });
    expect(await checkUrl("https://a.example/old", h.transport)).toMatchObject({ state: "ok", finalUrl: "https://a.example/new" });
    expect(h.seen).toEqual(["https://a.example/old", "https://a.example/new"]);
  });
  it("перенаправлення у приватну мережу — не йдемо (SSRF через редирект)", async () => {
    for (const loc of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/", "http://localhost/", "file:///etc/passwd", "http://[::1]/"]) {
      const h = hops({ status: 302, location: loc }, { status: 200 });
      const r = await checkUrl("https://a.example/x", h.transport);
      expect(r.state, loc).toBe("unknown");
      expect(r.detail, loc).toContain("відхилено");
      expect(h.seen, loc).toEqual(["https://a.example/x"]); // другого запиту не було
    }
  });
  it("нескінченні перенаправлення обриваються", async () => {
    const r = await checkUrl("https://a.example/x", hops({ status: 302, location: "/x" }).transport);
    expect(r).toMatchObject({ state: "unknown", detail: "забагато перенаправлень" });
  });
  it("приватна адреса в самих даних — транспорт не викликається", async () => {
    const h = hops({ status: 200 });
    expect((await checkUrl("http://169.254.169.254/", h.transport)).state).toBe("unknown");
    expect(h.seen).toEqual([]);
  });
  it("помилки з'єднання: немає домену й сертифікат — мертве; таймаут, обрив — не вдалося", async () => {
    const err = (code: string) => Object.assign(new Error(code), { code });
    expect(await checkUrl("https://a.example/", hops(err("ENOTFOUND")).transport)).toMatchObject({ state: "dead", detail: "домену немає" });
    expect((await checkUrl("https://a.example/", hops(err("CERT_HAS_EXPIRED")).transport)).state).toBe("dead");
    expect(await checkUrl("https://a.example/", hops(err("ETIMEDOUT")).transport)).toMatchObject({ state: "unknown", detail: "таймаут" });
    expect((await checkUrl("https://a.example/", hops(err("ECONNRESET")).transport)).state).toBe("unknown");
    expect((await checkUrl("https://a.example/", hops(err("ECHECK_BLOCKED")).transport)).detail).toContain("приватна");
  });
});

describe("safeLookup — перевірка на самому з'єднанні (захист від DNS rebinding)", () => {
  it("ім'я, що розв'язується в loopback, відхиляється до connect", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => safeLookup("localhost", {}, (e) => resolve(e)));
    expect(err?.code).toBe("ECHECK_BLOCKED");
  });
  it("літеральна приватна адреса теж", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => safeLookup("169.254.169.254", {}, (e) => resolve(e)));
    expect(err?.code).toBe("ECHECK_BLOCKED");
  });
});

describe("fakeBase — фейковий сервер лише локально", () => {
  it("вимкнено без змінної, на Vercel і для чужого хоста", () => {
    expect(fakeBase({})).toBeNull();
    expect(fakeBase({ ADMIN_LINKS_FAKE: "http://127.0.0.1:4455", VERCEL: "1" })).toBeNull();
    expect(fakeBase({ ADMIN_LINKS_FAKE: "https://evil.example" })).toBeNull();
    expect(fakeBase({ ADMIN_LINKS_FAKE: "http://127.0.0.1:4455" })?.origin).toBe("http://127.0.0.1:4455");
  });
});
