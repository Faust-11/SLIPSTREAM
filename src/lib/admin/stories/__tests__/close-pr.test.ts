// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GitHub } from "../../github";
import { closeAdminPr } from "../close-pr";

type P = { number: number; title: string; html_url: string; state: string; merged_at: string | null; labels: { name: string }[]; head: { ref: string } };
const pr = (number: number, ref: string, over: Partial<P> = {}): P => ({ number, title: `t${number}`, html_url: `https://github.com/x/pull/${number}`, state: "open", merged_at: null, labels: [{ name: "admin" }], head: { ref }, ...over });

function setup(prs: P[], failPatch = false) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace("https://api.github.com/repos/Faust-11/SLIPSTREAM", "");
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (method === "GET" && path.startsWith("/pulls?state=open")) return new Response(JSON.stringify(prs.filter((p) => p.state === "open")), { status: 200 });
    const one = path.match(/^\/pulls\/(\d+)$/);
    const hit = one ? prs.find((p) => p.number === Number(one[1])) : undefined;
    if (!hit) return new Response("{}", { status: 404 });
    if (method === "PATCH") return failPatch ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ ...hit, state: "closed" }), { status: 200 });
    return new Response(JSON.stringify(hit), { status: 200 });
  }) as typeof fetch;
  return { gh: new GitHub({ api: "https://api.github.com", repo: "Faust-11/SLIPSTREAM", token: "t" }, fetchImpl), calls };
}

describe("closeAdminPr — закрити застряглий PR історії", () => {
  it("закриває відкритий PR адмінки цієї історії (PATCH state=closed)", async () => {
    const s = setup([pr(7, "admin/stories-jerez-1997-20261120-101500")]);
    expect(await closeAdminPr(s.gh, "jerez-1997", 7)).toBe("closed");
    expect(s.calls).toContain("PATCH /pulls/7");
  });

  it("PR іншої історії, довільний номер, неіснуючий — «bad», PATCH не викликається", async () => {
    const s = setup([pr(7, "admin/stories-imola-1994-20261120-101500"), pr(8, "feature/x", { labels: [] })]);
    expect(await closeAdminPr(s.gh, "jerez-1997", 7)).toBe("bad");
    expect(await closeAdminPr(s.gh, "jerez-1997", 8)).toBe("bad");
    expect(await closeAdminPr(s.gh, "jerez-1997", 999)).toBe("bad");
    expect(s.calls.some((c) => c.startsWith("PATCH"))).toBe(false);
  });

  it("гілка не з admin/ або без мітки admin — не закриваємо, навіть якщо номер у списку", async () => {
    // Потрапляє в список за назвою гілки історії, але без мітки.
    const noLabel = setup([pr(7, "admin/stories-jerez-1997-20261120-101500", { labels: [] })]);
    expect(await closeAdminPr(noLabel.gh, "jerez-1997", 7)).toBe("bad");
    expect(noLabel.calls.some((c) => c.startsWith("PATCH"))).toBe(false);
  });

  it("помилка GitHub при закритті — «github»", async () => {
    const s = setup([pr(7, "admin/stories-jerez-1997-20261120-101500")], true);
    expect(await closeAdminPr(s.gh, "jerez-1997", 7)).toBe("github");
  });
});
