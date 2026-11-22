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
 *   GET /__link?u=<адреса> — «сайт джерела» для перевірки посилань: статус за хостом (fia — 200, motorsport — 404, skysports — 429,
 *     yahoo — 302 у 169.254.169.254, решта — 200). GET /wayback/available?url= і /save/<адреса> — «Web Archive» (знімок є лише для fia
 *     і aljazeera; Save Page Now: skysports — 302 на знімок, gpfans — 520, решта — 200 без адреси).
 *   POST /__override {path, content} / DELETE /__override?path= — підмінити вміст файла лише для читання через фейковий GitHub
 *     (перегляд чернетки: «у main» історія — чернетка, а файли на диску й збірка — ні).
 *   POST /__merge?has=<частина назви> — позначити останній такий PR злитим (журнал версій, відкат).
 *   PATCH /pulls/:n {state:"closed"} — закрити PR без злиття (кнопка «Закрити PR» в адмінці).
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
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
const overrides = new Map(); // шлях → вміст: що «лежить у main» замість файла на диску
const blobs = new Map(); // blob → вміст (Buffer): e2e бачать, що саме опубліковано
const treeBlobs = new Map(); // дерево → { шлях: blob }
let seq = 0;
const FILES = [
  { title: "File:Fake Driver Portrait 1958.jpg", license: "Public domain", artist: "<a href=\"x\">Fake Photographer</a>" },
  { title: "File:Fake NC Photo.jpg", license: "CC BY-NC 2.0", artist: "NC Author" },
  { title: "File:Fake ND Photo.jpg", license: "CC BY-ND 2.0", artist: "ND Author" },
];
let jpeg;
/** Найпростіший unified diff: однакові початок і кінець зрізаємо, середина — «−старе +нове» (для e2e цього досить). */
function unifiedDiff(a, b) {
  const x = a.split("\n");
  const y = b.split("\n");
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  let j = 0;
  while (j < x.length - i && j < y.length - i && x[x.length - 1 - j] === y[y.length - 1 - j]) j++;
  const del = x.slice(i, x.length - j);
  const add = y.slice(i, y.length - j);
  const patch = [`@@ -${i + 1},${del.length} +${i + 1},${add.length} @@`, ...del.map((l) => `-${l}`), ...add.map((l) => `+${l}`)].join("\n");
  return { additions: add.length, deletions: del.length, patch };
}
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

// OpenF1 (OPENF1_API → http://127.0.0.1:<порт>/openf1): сесії року, результати й пілоти гонки Лас-Вегаса 2026 (етап 21,
// 22.11 04:00–06:00 UTC) — для попередніх результатів на головній (/api/prelim). ?__none=1 у URL бази не потрібен: порожній
// стан перевіряє e2e на іншому етапі (немає сесії → 404).
const OF1_SESSIONS = [
  { session_key: 11420, meeting_key: 1300, session_name: "Race", date_start: "2026-11-22T04:00:00+00:00", date_end: "2026-11-22T06:00:00+00:00" },
  { session_key: 11428, meeting_key: 1301, session_name: "Race", date_start: "2026-11-29T16:00:00+00:00", date_end: "2026-11-29T18:00:00+00:00" },
];
const OF1_DRIVERS = [
  { driver_number: 3, first_name: "Max", last_name: "Verstappen", full_name: "Max VERSTAPPEN", name_acronym: "VER", team_name: "Red Bull Racing", team_colour: "3671C6" },
  { driver_number: 1, first_name: "Lando", last_name: "Norris", full_name: "Lando NORRIS", name_acronym: "NOR", team_name: "McLaren", team_colour: "FF8000" },
  { driver_number: 81, first_name: "Oscar", last_name: "Piastri", full_name: "Oscar PIASTRI", name_acronym: "PIA", team_name: "McLaren", team_colour: "FF8000" },
  { driver_number: 44, first_name: "Lewis", last_name: "Hamilton", full_name: "Lewis HAMILTON", name_acronym: "HAM", team_name: "Ferrari", team_colour: "E8002D" },
  { driver_number: 16, first_name: "Charles", last_name: "Leclerc", full_name: "Charles LECLERC", name_acronym: "LEC", team_name: "Ferrari", team_colour: "E8002D" },
  { driver_number: 55, first_name: "Carlos", last_name: "Sainz", full_name: "Carlos SAINZ", name_acronym: "SAI", team_name: "Williams", team_colour: "64C4FF" },
];
const OF1_RESULT = [
  { position: 1, driver_number: 3, number_of_laps: 50, points: 25, dnf: false, dns: false, dsq: false, duration: 5259.624, gap_to_leader: 0 },
  { position: 2, driver_number: 1, number_of_laps: 50, points: 18, dnf: false, dns: false, dsq: false, duration: 5260.263, gap_to_leader: 0.639 },
  { position: 3, driver_number: 81, number_of_laps: 50, points: 15, dnf: false, dns: false, dsq: false, duration: 5261.153, gap_to_leader: 1.529 },
  { position: 4, driver_number: 16, number_of_laps: 49, points: 12, dnf: false, dns: false, dsq: false, duration: null, gap_to_leader: "+1 LAP" },
  { position: 5, driver_number: 44, number_of_laps: 30, points: 0, dnf: true, dns: false, dsq: false, duration: null, gap_to_leader: null },
];
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

  if (req.method === "GET" && url.pathname === "/openf1/sessions") return json(res, 200, OF1_SESSIONS);
  if (req.method === "GET" && url.pathname === "/openf1/session_result") return json(res, 200, url.searchParams.get("session_key") === "11420" ? OF1_RESULT : []);
  if (req.method === "GET" && url.pathname === "/openf1/drivers") return json(res, 200, url.searchParams.get("session_key") === "11420" ? OF1_DRIVERS : []);

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
        const target = decodeURIComponent(p.slice("/contents/".length));
        if ((await stat(target)).isDirectory()) {
          // Перелік теки (Contents API): назва, тип, sha blob — для зміни адреси історії (фото переносяться за sha).
          const entries = await readdir(target, { withFileTypes: true });
          return json(res, 200, await Promise.all(entries.map(async (e) => ({ name: e.name, path: `${target}/${e.name}`, type: e.isDirectory() ? "dir" : "file", sha: e.isDirectory() ? "tree-x" : "blob-" + (await stat(`${target}/${e.name}`)).size }))));
        }
        const buf = overrides.has(target) ? Buffer.from(overrides.get(target), "utf8") : await readFile(target);
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
      return json(res, 200, prs.filter((x) => (open ? !x.merged_at && !x.closed : x.merged_at)).map((x) => ({ ...x, state: x.merged_at || x.closed ? "closed" : "open" })));
    }
    const one = p.match(/^\/pulls\/(\d+)(\/files)?$/);
    if (req.method === "GET" && one) {
      const pr = prs.find((x) => x.number === Number(one[1]));
      if (!pr) return json(res, 404, { message: "Not Found" });
      if (!one[2]) return json(res, 200, { ...pr, state: pr.merged_at || pr.closed ? "closed" : "open", commits: 1, base: { ref: "main" }, merge_commit_sha: pr.merged_at ? "merge0" : null });
      const out = [];
      for (const path of pr.paths) {
        const next = pr.files[path];
        if (next === undefined) {
          out.push({ filename: path, status: "added", additions: 0, deletions: 0 }); // фото: patch немає, як у GitHub для зображень
          continue;
        }
        const old = await readFile(path, "utf8").catch(() => "");
        out.push({ filename: path, status: old ? "modified" : "added", ...unifiedDiff(old, next) });
      }
      return json(res, 200, out);
    }
    if (req.method === "PATCH" && one && !one[2]) {
      const pr = prs.find((x) => x.number === Number(one[1]));
      if (!pr) return json(res, 404, { message: "Not Found" });
      const b = JSON.parse((await body(req)) || "{}");
      if (b.state === "closed" && !pr.merged_at) pr.closed = true;
      return json(res, 200, { number: pr.number, state: pr.merged_at || pr.closed ? "closed" : "open" });
    }
    if (req.method === "POST") {
      const b = JSON.parse((await body(req)) || "{}");
      if (p === "/git/blobs") {
        const sha = `blob${++seq}`;
        blobs.set(sha, Buffer.from(b.content ?? "", "base64"));
        return json(res, 201, { sha });
      }
      if (p === "/git/trees") {
        const sha = `tree${++seq}`;
        trees.set(sha, b.tree.map((e) => e.path));
        treeBlobs.set(sha, Object.fromEntries(b.tree.map((e) => [e.path, e.sha])));
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
        const treeSha = commits.get(refs.get(b.head));
        const lastTree = trees.get(treeSha) ?? [];
        const files = Object.fromEntries(Object.entries(treeBlobs.get(treeSha) ?? {}).filter(([, sha]) => blobs.has(sha)).map(([path, sha]) => [path, blobs.get(sha).toString("utf8")]));
        prs.push({ number, title: b.title, body: b.body, draft: !!b.draft, head: { ref: b.head }, html_url: `https://github.com/Faust-11/SLIPSTREAM/pull/${number}`, labels: [{ name: "admin" }], merged_at: null, paths: lastTree, files });
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

  if (req.method === "GET" && url.pathname === "/__link") {
    const host = new URL(url.searchParams.get("u") ?? "https://x.example").hostname;
    if (host.endsWith("motorsport.com")) return res.writeHead(404).end();
    if (host.endsWith("skysports.com")) return res.writeHead(429).end();
    if (host.endsWith("yahoo.com")) return res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    return res.writeHead(200).end("ok");
  }
  if (req.method === "GET" && url.pathname === "/wayback/available") {
    const target = url.searchParams.get("url") ?? "";
    const host = new URL(target).hostname;
    const has = host.endsWith("fia.com") || host.endsWith("aljazeera.com");
    return json(res, 200, has ? { url: target, archived_snapshots: { closest: { status: "200", available: true, url: `http://web.archive.org/web/20260421173102/${target}`, timestamp: "20260421173102" } } } : { url: target, archived_snapshots: {} });
  }
  if (req.method === "GET" && url.pathname.startsWith("/save/")) {
    const target = req.url.slice("/save/".length);
    const host = new URL(target).hostname;
    if (host.endsWith("skysports.com")) return res.writeHead(302, { location: `https://web.archive.org/web/20261120140746/${target}` }).end();
    if (host.endsWith("gpfans.com")) return res.writeHead(520).end();
    return res.writeHead(200).end("ok");
  }

  if (url.pathname === "/__override") {
    if (req.method === "POST") {
      const b = JSON.parse((await body(req)) || "{}");
      overrides.set(String(b.path), String(b.content));
      return json(res, 200, {});
    }
    if (req.method === "DELETE") {
      overrides.delete(url.searchParams.get("path") ?? "");
      return json(res, 200, {});
    }
  }

  if (req.method === "POST" && url.pathname === "/__merge") {
    const has = url.searchParams.get("has") ?? "";
    const pr = prs.filter((x) => x.title.includes(has) && !x.merged_at).at(-1);
    if (!pr) return json(res, 404, {});
    pr.merged_at = new Date().toISOString();
    return json(res, 200, { number: pr.number });
  }

  if (req.method === "GET" && url.pathname === "/__mail") {
    const m = mail.get(url.searchParams.get("to") ?? "");
    return m ? json(res, 200, m) : json(res, 404, {});
  }

  res.writeHead(404).end("not found");
}).listen(port, "127.0.0.1", () => console.log(`fake GitHub OAuth, Resend, Commons, GitHub API on http://127.0.0.1:${port}`));
