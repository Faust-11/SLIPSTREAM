#!/usr/bin/env node
/**
 * Фейковий PostgREST для збірки й e2e без живого Supabase: віддає JSON-фікстури бази
 * (e2e/fixtures/db/<подання>.json, вивантажені з CI-бази скриптом scripts/db/export_fixture.py).
 *
 *   node scripts/dev/fake-postgrest.mjs [--port 54321]
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=test npm run build
 *
 * Перевіряє ті самі заголовки, що й Supabase (apikey, Accept-Profile: f1); фільтр `ref=in.(…)` — для drivers.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || 54321);
const dir = new URL("../../e2e/fixtures/db/", import.meta.url).pathname;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (req.method !== "GET" || !m) return res.writeHead(404).end("not found");
  if (!req.headers.apikey || req.headers["accept-profile"] !== "f1") return res.writeHead(401).end("missing apikey / profile");
  try {
    let rows = JSON.parse(await readFile(join(dir, `${m[1]}.json`), "utf8"));
    const refIn = /^in\.\((.*)\)$/.exec(url.searchParams.get("ref") ?? "");
    if (refIn) {
      // searchParams уже декодовано один раз (як у PostgREST) — повторний decodeURIComponent падав би на «%».
      const refs = new Set(refIn[1].split(","));
      rows = rows.filter((r) => refs.has(r.ref));
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(rows));
  } catch {
    res.writeHead(404).end(`no fixture for ${m[1]}`);
  }
}).listen(port, "127.0.0.1", () => console.log(`fake PostgREST on http://127.0.0.1:${port}`));
