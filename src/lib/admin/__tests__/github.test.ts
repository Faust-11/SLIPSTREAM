// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GitHub, branchName, parseGitHubEnv, publish } from "../github";
import { isAdminPath } from "../paths";

describe("isAdminPath — адмінка змінює лише контент", () => {
  it.each([
    "content/stories/jerez-1997/uk.md",
    "content/stories/jerez-1997/story.json",
    "src/data/curated/driver-portraits.json",
    "public/img/drivers/senna-96.webp",
    "public/img/stories/jerez-1997/m1-1280.webp",
  ])("так: %s", (p) => expect(isAdminPath(p)).toBe(true));

  it.each([
    "content/stories/README.md",
    "src/lib/admin/github.ts",
    "src/proxy.ts",
    ".github/workflows/ci.yml",
    "package.json",
    "next.config.ts",
    "public/img/../../src/proxy.ts",
    "public/img/drivers/x.html",
    "public/img/circuits/monza.svg",
    "public/img/drivers/senna.jpg",
    "content/stories/jerez-1997/notes.txt",
    "public/img/.hidden/x.webp",
    "src/data/curated/../snapshot/teams.json",
    "content/stories/a/../../../package.json",
    "/content/stories/a/uk.md",
    "Content/stories/a/uk.md",
  ])("ні: %s", (p) => expect(isAdminPath(p)).toBe(false));
});

describe("parseGitHubEnv", () => {
  it("токен обов'язковий; репозиторій за замовчуванням", () => {
    expect(parseGitHubEnv({})).toBeNull();
    expect(parseGitHubEnv({ ADMIN_GITHUB_TOKEN: "t" })).toEqual({ api: "https://api.github.com", repo: "Faust-11/SLIPSTREAM", token: "t" });
  });
  it("фейковий API — лише localhost і не на Vercel", () => {
    expect(parseGitHubEnv({ ADMIN_GITHUB_TOKEN: "t", ADMIN_GITHUB_API: "http://127.0.0.1:4466" })?.api).toBe("http://127.0.0.1:4466");
    expect(parseGitHubEnv({ ADMIN_GITHUB_TOKEN: "t", ADMIN_GITHUB_API: "http://127.0.0.1:4466", VERCEL: "1" })).toBeNull();
    expect(parseGitHubEnv({ ADMIN_GITHUB_TOKEN: "t", ADMIN_GITHUB_API: "https://evil.example" })).toBeNull();
    expect(parseGitHubEnv({ ADMIN_GITHUB_TOKEN: "t", ADMIN_GITHUB_REPO: "../x" })).toBeNull();
  });
});

describe("branchName", () => {
  it("admin/<розділ>-<UTC>", () => {
    expect(branchName("photos", new Date(Date.UTC(2026, 10, 15, 14, 22, 33)))).toBe("admin/photos-20261115-142233");
    expect(() => branchName("../main")).toThrow();
  });
});

/** Фейковий GitHub у пам'яті: записує запити, віддає послідовні sha. */
function fakeGitHub() {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  let n = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace("/repos/Faust-11/SLIPSTREAM", "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: String(init.method), path, body, auth: new Headers(init.headers).get("authorization") });
    const reply = (json: unknown, status = 201) => new Response(JSON.stringify(json), { status });
    if (path === "/git/ref/heads/main") return reply({ object: { sha: "main-sha" } }, 200);
    if (path === "/git/commits/main-sha") return reply({ tree: { sha: "base-tree" } }, 200);
    if (path === "/pulls") return reply({ number: 77, html_url: "https://github.com/Faust-11/SLIPSTREAM/pull/77" });
    if (path === "/issues/77/labels") return reply([], 200);
    return reply({ sha: `sha-${++n}` });
  }) as unknown as typeof fetch;
  return { gh: new GitHub({ api: "https://api.github.com", repo: "Faust-11/SLIPSTREAM", token: "secret-token" }, fetchImpl), calls };
}

describe("publish", () => {
  const now = new Date(Date.UTC(2026, 10, 15, 14, 22, 33));

  it("гілка від main, blobs → tree → commit від Faust-11 → гілка → PR (чернетка) → мітка admin", async () => {
    const { gh, calls } = fakeGitHub();
    const res = await publish(
      gh,
      {
        section: "photos",
        title: "Фото боліда · Cadillac",
        body: "Обрано файл Commons.",
        draft: true,
        files: [
          { path: "src/data/curated/teams.json", content: '{"a":1}' },
          { path: "public/img/cars/cadillac-480.webp", content: new Uint8Array([1, 2, 3]) },
          { path: "public/img/cars/old-480.webp", content: null },
        ],
      },
      now,
    );
    expect(res).toEqual({ number: 77, url: "https://github.com/Faust-11/SLIPSTREAM/pull/77", branch: "admin/photos-20261115-142233" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /git/ref/heads/main",
      "GET /git/commits/main-sha",
      "POST /git/blobs",
      "POST /git/blobs",
      "POST /git/trees",
      "POST /git/commits",
      "POST /git/refs",
      "POST /pulls",
      "POST /issues/77/labels",
    ]);
    expect(calls.every((c) => c.auth === "Bearer secret-token")).toBe(true);
    expect(calls[2]!.body).toEqual({ content: Buffer.from('{"a":1}').toString("base64"), encoding: "base64" });
    expect(calls[3]!.body).toEqual({ content: "AQID", encoding: "base64" });
    expect(calls[4]!.body).toEqual({
      base_tree: "base-tree",
      tree: [
        { path: "src/data/curated/teams.json", mode: "100644", type: "blob", sha: "sha-1" },
        { path: "public/img/cars/cadillac-480.webp", mode: "100644", type: "blob", sha: "sha-2" },
        { path: "public/img/cars/old-480.webp", mode: "100644", type: "blob", sha: null },
      ],
    });
    expect(calls[5]!.body).toMatchObject({ tree: "sha-3", parents: ["main-sha"], author: { name: "Faust-11" }, committer: { name: "Faust-11" } });
    expect(calls[6]!.body).toEqual({ ref: "refs/heads/admin/photos-20261115-142233", sha: "sha-4" });
    expect(calls[7]!.body).toMatchObject({ head: "admin/photos-20261115-142233", base: "main", draft: true });
    expect(calls[8]!.body).toEqual({ labels: ["admin"] });
  });

  it("шлях поза контентом — помилка без жодного запиту", async () => {
    const { gh, calls } = fakeGitHub();
    await expect(
      publish(gh, { section: "photos", title: "x", body: "", draft: false, files: [{ path: ".github/workflows/ci.yml", content: "x" }] }, now),
    ).rejects.toThrow("шлях поза контентом");
    expect(calls).toEqual([]);
  });

  it("порожня правка і дубль шляху — помилка", async () => {
    const { gh } = fakeGitHub();
    await expect(publish(gh, { section: "photos", title: "x", body: "", draft: false, files: [] }, now)).rejects.toThrow("немає змін");
    const f = { path: "src/data/curated/teams.json", content: "x" };
    await expect(publish(gh, { section: "photos", title: "x", body: "", draft: false, files: [f, f] }, now)).rejects.toThrow("двічі");
  });
});
