import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Свіжий модуль на тест: стор тримає стан у змінних модуля. */
async function freshStore() {
  vi.resetModules();
  return await import("../account-store");
}
/** fetch, що відповідає, лише коли викличемо resolve. */
function deferred(body: unknown) {
  let resolve!: () => void;
  const gate = new Promise<void>((r) => (resolve = r));
  const fetchMock = vi.fn(async () => {
    await gate;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetchMock, resolve };
}

beforeEach(() => {
  document.cookie = "outlap_in=1; path=/";
});
afterEach(() => {
  document.cookie = "outlap_in=; path=/; max-age=0";
});

describe("account-store: застарілі відповіді /api/session (/code-review high)", () => {
  it("повільний старий запит не перезаписує setAnonymous (вихід)", async () => {
    const s = await freshStore();
    const slow = deferred({ user: { nick: "Old", profile: true } });
    vi.stubGlobal("fetch", slow.fetchMock);
    const pending = s.refreshAccount();
    s.setAnonymous();
    slow.resolve();
    await pending;
    expect(s.getAccount()).toEqual({ status: "anon" });
  });
  it("повільний старий запит не перезаписує свіжий нік (setNick)", async () => {
    const s = await freshStore();
    // перший (швидкий) запит ставить користувача, далі стартує повільний, і нік змінюється локально
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { nick: "Old", profile: true } }), { status: 200 })));
    await s.refreshAccount();
    const slow = deferred({ user: { nick: "Old", profile: true } });
    vi.stubGlobal("fetch", slow.fetchMock);
    const pending = s.refreshAccount();
    s.setNick("New");
    slow.resolve();
    await pending;
    expect(s.getAccount()).toEqual({ status: "user", nick: "New", profile: true });
  });
  it("два запити підряд: перемагає останній, навіть якщо відповів раніше", async () => {
    const s = await freshStore();
    const first = deferred({ user: { nick: "First", profile: true } });
    vi.stubGlobal("fetch", first.fetchMock);
    const p1 = s.refreshAccount();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ user: { nick: "Second", profile: true } }), { status: 200 })));
    await s.refreshAccount();
    first.resolve();
    await p1;
    expect(s.getAccount()).toMatchObject({ status: "user", nick: "Second" });
  });
  it("без позначки — анонім без запиту (як і було)", async () => {
    document.cookie = "outlap_in=; path=/; max-age=0";
    const s = await freshStore();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await s.refreshAccount();
    expect(s.getAccount()).toEqual({ status: "anon" });
    expect(f).not.toHaveBeenCalled();
  });
});
