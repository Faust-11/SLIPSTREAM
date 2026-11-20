#!/usr/bin/env node
/**
 * Фейковий PostgREST для збірки й e2e без живого Supabase: віддає JSON-фікстури бази
 * (e2e/fixtures/db/<подання>.json, вивантажені з CI-бази скриптом scripts/db/export_fixture.py).
 *
 *   node scripts/dev/fake-postgrest.mjs [--port 54321]
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=test npm run build
 *
 * Перевіряє ті самі заголовки, що й Supabase (apikey, Accept-Profile: f1); фільтр `ref=in.(…)` — для drivers;
 * limit/offset і Prefer: count=exact — для посторінкового читання (dbSelectAll).
 * Додатково — фейковий Supabase Auth і play (scripts/dev/fake-supabase-auth.mjs) для e2e входу.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { handleSupabaseFake } from "./fake-supabase-auth.mjs";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 54321);
const dir = new URL("../../e2e/fixtures/db/", import.meta.url).pathname;

/** Розділяє список select= за комами верхнього рівня (коми у вкладених дужках не чіпає). */
function splitTop(list) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  // Вхід відвідувачів (фаза 9a): /auth/v1/*, /rest/v1/rpc/*, /rest/v1/profiles зі схемою play, /__auth/* — тестові керування.
  if (await handleSupabaseFake(req, res, url, port)) return;
  const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (req.method !== "GET" || !m) return res.writeHead(404).end("not found");
  if (!req.headers.apikey || req.headers["accept-profile"] !== "f1") return res.writeHead(401).end("missing apikey / profile");
  try {
    let rows = JSON.parse(await readFile(join(dir, `${m[1]}.json`), "utf8"));
    // select= — лише названі колонки, як у PostgREST (забута колонка в запиті має проявитись і в тестах);
    // невідома колонка — 400, як «column … does not exist».
    const select = url.searchParams.get("select");
    if (select && select !== "*") {
      // Коми всередині дужок — вкладений ресурс (`sessions!inner(type,rounds!inner(season_year,number))`): розділяємо лише
      // верхній рівень; вкладений об'єкт віддаємо як є (фікстура вже в цій формі), а колонку вкладення перевіряємо за назвою.
      const cols = splitTop(select);
      const base = (c) => {
        const i = c.search(/[!(]/);
        return i < 0 ? c : c.slice(0, i);
      };
      const missing = rows.length ? cols.filter((c) => !(base(c) in rows[0])) : [];
      if (missing.length) return res.writeHead(400).end(`column ${m[1]}.${missing[0]} does not exist`);
      rows = rows.map((r) => Object.fromEntries(cols.map((c) => [base(c), r[base(c)]])));
    }
    const refIn = /^in\.\((.*)\)$/.exec(url.searchParams.get("ref") ?? "");
    if (refIn) {
      // searchParams уже декодовано один раз (як у PostgREST) — повторний decodeURIComponent падав би на «%».
      const refs = new Set(refIn[1].split(","));
      rows = rows.filter((r) => refs.has(r.ref));
    }
    // limit/offset і Prefer: count=exact (Content-Range «0-999/1154»), як у PostgREST — для dbSelectAll.
    const total = rows.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : total;
    rows = rows.slice(offset, offset + limit);
    const headers = { "content-type": "application/json" };
    if (/count=exact/.test(req.headers.prefer ?? "")) {
      headers["content-range"] = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`;
    }
    res.writeHead(200, headers).end(JSON.stringify(rows));
  } catch {
    res.writeHead(404).end(`no fixture for ${m[1]}`);
  }
}).listen(port, "127.0.0.1", () => console.log(`fake PostgREST on http://127.0.0.1:${port}`));
