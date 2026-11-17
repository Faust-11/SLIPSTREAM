#!/usr/bin/env node
/**
 * Фейкові сервіси для e2e адмінки — без справжніх ключів і мережі: GitHub OAuth, Resend, Wikimedia Commons і GitHub API.
 *
 *   node scripts/dev/fake-services.mjs [--port 4455]
 *   ADMIN_GITHUB_OAUTH_BASE / ADMIN_RESEND_API / ADMIN_COMMONS_API / ADMIN_GITHUB_API = http://127.0.0.1:4455
 *   (адмінка приймає їх лише на localhost і не на Vercel — src/lib/admin/env.ts, github.ts, photos/commons.ts)
 *
 * GitHub: хто «входить» — cookie `fake_gh` на домені фейку: `<id>:<login>`; без неї — «скасував вхід».
 *   Перевіряє те саме, що GitHub: client_id/secret, redirect_uri, PKCE S256, одноразовий код; /user — за токеном.
 * Resend: POST /emails з ключем `test-resend-key` зберігає лист; GET /__mail?to=<адреса> — останній лист (для e2e).
 * Commons: /w/api.php (пошук і файл) — 3 файли з різними ліцензіями; /thumb/<n>.jpg — справжній JPEG 1600×1000.
 * GitHub API (токен `test-gh-token`): вміст файлів — з локального репозиторію; коміт/PR записуються,
 *   GET /__last-pr — останній PR і шляхи його дерева (для e2e).
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 4455);
const CLIENT_ID = "test-gh-client";
const CLIENT_SECRET = "test-gh-secret";
const RESEND_KEY = "test-resend-key";

/** code → { redirectUri, challenge, user, exp } */
const codes = new Map();
/** token → user */
const tokens = new Map();
/** адреса → останній лист */
const mail = new Map();
const GH_TOKEN = "test-gh-token";
const REPO = "/repos/Faust-11/SLIPSTREAM";
const prs = [];
const trees = new Map(); // дерево → шляхи
const commits = new Map(); // коміт → дерево
const refs = new Map(); // гілка → коміт
let seq = 0;
const FILES = [
  { title: "File:Fake Driver Portrait 1958.jpg", license: "Public domain", artist: "<a href=\"x\">Fake Photographer</a>" },
  { title: "File:Fake NC Photo.jpg", license: "CC BY-NC 2.0", artist: "NC Author" },
  { title: "File:Fake ND Photo.jpg", license: "CC BY-ND 2.0", artist: "ND Author" },
];
let jpeg;
const thumb = async () => (jpeg ??= await sharp({ create: { width: 1600, height: 1000, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer());
const page = (f, i) => ({
  title: f.title,
  index: i + 1,
  imageinfo: [
    {
      thumburl: `http://127.0.0.1:${port}/thumb/${i}.jpg`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title)}`,
      width: 1600,
      height: 1000,
      mime: "image/jpeg",
      extmetadata: { LicenseShortName: { value: f.license }, Artist: { value: f.artist } },
    },
  ],
});

const b64url = (b) => Buffer.from(b).toString("base64url");
const json = (res, status, body) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));
const body = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
function cookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
    const p = url.searchParams;
    if (p.get("client_id") !== CLIENT_ID || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) return res.writeHead(400).end("bad request");
    const redirect = new URL(p.get("redirect_uri") ?? "");
    const user = cookie(req, "fake_gh");
    if (!user) {
      redirect.searchParams.set("error", "access_denied");
    } else {
      const [id, login] = user.split(":");
      const code = b64url(randomBytes(20));
      codes.set(code, { redirectUri: redirect.href, challenge: p.get("code_challenge"), user: { id: Number(id), login }, exp: Date.now() + 60_000 });
      redirect.searchParams.set("code", code);
    }
    redirect.searchParams.set("state", p.get("state") ?? "");
    return res.writeHead(302, { location: redirect.href }).end();
  }

  if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
    const p = new URLSearchParams(await body(req));
    const entry = codes.get(p.get("code") ?? "");
    codes.delete(p.get("code") ?? "");
    const challenge = b64url(createHash("sha256").update(p.get("code_verifier") ?? "").digest());
    if (!entry || entry.exp < Date.now() || p.get("client_id") !== CLIENT_ID || p.get("client_secret") !== CLIENT_SECRET || p.get("redirect_uri") !== entry.redirectUri || challenge !== entry.challenge) {
      return json(res, 200, { error: "bad_verification_code" }); // GitHub так і відповідає — 200 з error
    }
    const token = b64url(randomBytes(20));
    tokens.set(token, entry.user);
    return json(res, 200, { access_token: token, token_type: "bearer", scope: "" });
  }

  if (req.method === "GET" && url.pathname === "/user") {
    const user = tokens.get((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    return user ? json(res, 200, user) : json(res, 401, { message: "Bad credentials" });
  }

  if (req.method === "POST" && url.pathname === "/emails") {
    if (req.headers.authorization !== `Bearer ${RESEND_KEY}`) return json(res, 401, { message: "invalid key" });
    const m = JSON.parse(await body(req));
    for (const to of m.to ?? []) mail.set(to, m);
    return json(res, 200, { id: b64url(randomBytes(8)) });
  }
  if (req.method === "GET" && url.pathname === "/w/api.php") {
    const titles = url.searchParams.get("titles");
    const list = titles ? FILES.map(page).filter((p) => p.title === titles) : FILES.map(page);
    return json(res, 200, { query: { pages: list } });
  }
  if (req.method === "GET" && url.pathname.startsWith("/thumb/")) {
    return res.writeHead(200, { "content-type": "image/jpeg" }).end(await thumb());
  }

  if (url.pathname.startsWith(REPO)) {
    if (req.headers.authorization !== `Bearer ${GH_TOKEN}`) return json(res, 401, { message: "Bad credentials" });
    const p = url.pathname.slice(REPO.length);
    const now = new Date().toISOString();
    if (req.method === "GET" && p.startsWith("/contents/")) {
      try {
        const buf = await readFile(decodeURIComponent(p.slice("/contents/".length)));
        return json(res, 200, { content: buf.toString("base64"), encoding: "base64", size: buf.length, sha: "blob-" + buf.length });
      } catch {
        return json(res, 404, { message: "Not Found" });
      }
    }
    if (req.method === "GET" && p === "/git/ref/heads/main") return json(res, 200, { object: { sha: "main0" } });
    if (req.method === "GET" && p.startsWith("/git/commits/")) return json(res, 200, { tree: { sha: "tree0" }, parents: [{ sha: "main-1" }] });
    if (req.method === "GET" && p === "/commits/main") return json(res, 200, { sha: "main0", commit: { committer: { date: now } } });
    if (req.method === "GET" && p === "/commits/main/status") return json(res, 200, { statuses: [{ context: "Vercel", state: "success" }] });
    if (req.method === "GET" && p.startsWith("/actions/workflows/")) return json(res, 200, { workflow_runs: [{ status: "completed", conclusion: "success", created_at: now, html_url: "https://github.com/x", head_sha: "main0" }] });
    if (req.method === "GET" && p === "/pulls") {
      const open = url.searchParams.get("state") === "open";
      return json(res, 200, prs.filter((x) => (open ? !x.merged_at : x.merged_at)));
    }
    if (req.method === "POST") {
      const b = JSON.parse((await body(req)) || "{}");
      if (p === "/git/blobs") return json(res, 201, { sha: `blob${++seq}` });
      if (p === "/git/trees") {
        const sha = `tree${++seq}`;
        trees.set(sha, b.tree.map((e) => e.path));
        return json(res, 201, { sha });
      }
      if (p === "/git/commits") {
        const sha = `commit${++seq}`;
        commits.set(sha, b.tree);
        return json(res, 201, { sha, tree: b.tree });
      }
      if (p === "/git/refs") {
        refs.set(b.ref.replace(/^refs\/heads\//, ""), b.sha);
        return json(res, 201, { ref: b.ref });
      }
      if (p === "/pulls") {
        const number = 1000 + prs.length;
        // Шляхи — з дерева коміту саме цієї гілки (паралельні тести не змішуються).
        const lastTree = trees.get(commits.get(refs.get(b.head))) ?? [];
        prs.push({ number, title: b.title, body: b.body, draft: !!b.draft, head: { ref: b.head }, html_url: `https://github.com/Faust-11/SLIPSTREAM/pull/${number}`, labels: [{ name: "admin" }], merged_at: null, paths: lastTree });
        return json(res, 201, { number, html_url: `https://github.com/Faust-11/SLIPSTREAM/pull/${number}` });
      }
      if (/^\/issues\/\d+\/labels$/.test(p)) return json(res, 200, [{ name: "admin" }]);
    }
    return json(res, 404, { message: "Not Found" });
  }
  // YouTube: oEmbed — OFFICIAL001 з каналу FORMULA 1, OTHERCHAN01 — з іншого, решта — 404; maxres є лише в офіційного.
  if (url.pathname === "/oembed") {
    const id = new URL(url.searchParams.get("url") ?? "https://x").searchParams.get("v");
    if (id === "OFFICIAL001") return json(res, 200, { title: "Race Highlights | 2026 Las Vegas Grand Prix", author_name: "FORMULA 1", author_url: "https://www.youtube.com/@Formula1" });
    if (id === "OTHERCHAN01") return json(res, 200, { title: "F1 reupload", author_name: "Someone", author_url: "https://www.youtube.com/@Someone" });
    return res.writeHead(404).end("Not Found");
  }
  if (url.pathname.startsWith("/vi/")) return res.writeHead(url.pathname.includes("OFFICIAL001") ? 200 : 404).end();

  // Останній PR, у назві якого є ?has= (паралельні тести не читають чужі PR).
  if (req.method === "GET" && url.pathname === "/__last-pr") {
    const has = url.searchParams.get("has") ?? "";
    const pr = prs.filter((p) => p.title.includes(has)).at(-1);
    return pr ? json(res, 200, pr) : json(res, 404, {});
  }

  if (req.method === "GET" && url.pathname === "/__mail") {
    const m = mail.get(url.searchParams.get("to") ?? "");
    return m ? json(res, 200, m) : json(res, 404, {});
  }

  res.writeHead(404).end("not found");
}).listen(port, "127.0.0.1", () => console.log(`fake GitHub OAuth, Resend, Commons, GitHub API on http://127.0.0.1:${port}`));
