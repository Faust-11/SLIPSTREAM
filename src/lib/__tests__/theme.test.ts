import { afterEach, describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  nextTheme,
  readStoredTheme,
  resolveTheme,
  restoreHtmlAttributes,
  themeScriptSource,
  writeStoredTheme,
} from "../theme";

function storageWith(value: string | null): Storage {
  const data = new Map<string, string>();
  if (value !== null) data.set(THEME_STORAGE_KEY, value);
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const throwingStorage = new Proxy({} as Storage, {
  get() {
    throw new DOMException("denied", "SecurityError");
  },
});

describe("readStoredTheme", () => {
  it("повертає збережену коректну тему", () => {
    expect(readStoredTheme(storageWith("dark"))).toBe("dark");
    expect(readStoredTheme(storageWith("light"))).toBe("light");
  });

  it("некоректні значення, відсутність і винятки → null", () => {
    expect(readStoredTheme(storageWith("purple"))).toBeNull();
    expect(readStoredTheme(storageWith(null))).toBeNull();
    expect(readStoredTheme(null)).toBeNull();
    expect(readStoredTheme(throwingStorage)).toBeNull();
  });
});

describe("writeStoredTheme", () => {
  it("зберігає тему за ключем ss-theme", () => {
    const s = storageWith(null);
    writeStoredTheme(s, "dark");
    expect(s.getItem("ss-theme")).toBe("dark");
  });

  it("не падає, якщо сховище недоступне", () => {
    expect(() => writeStoredTheme(throwingStorage, "dark")).not.toThrow();
    expect(() => writeStoredTheme(null, "dark")).not.toThrow();
  });
});

describe("nextTheme / resolveTheme", () => {
  it("перемикає світлу й темну", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("явний вибір важливіший за систему, інакше — система", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("purple", true)).toBe("dark");
  });
});

describe("themeScriptSource (inline-скрипт у <head>)", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  afterEach(() => {
    if (original) Object.defineProperty(window, "localStorage", original);
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-js");
  });

  function runWith(storage: Storage) {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => storage });
    new Function(themeScriptSource)();
    return document.documentElement.getAttribute("data-theme");
  }

  it("data-list-query — лише на «Команди» / «Пілоти» / «Траси» з параметрами списку (рев'ю: футер ховався на інших сторінках)", () => {
    const cases: [string, boolean][] = [
      ["/uk/teams?q=lotus", true],
      ["/teams?f=win", true],
      ["/teams?sort=a", true],
      ["/teams", false],
      ["/uk?f=1", false],
      ["/uk/drivers?sort=st", true],
      ["/drivers?p=2", true],
      ["/drivers", false],
      ["/drivers?utm_source=fb", false],
      ["/teams?utm_source=fb", false],
      ["/uk/circuits?f=cal", true],
      ["/circuits?q=monza", true],
      ["/circuits", false],
      ["/circuits/monza?q=1", false],
    ];
    for (const [url, expected] of cases) {
      window.history.replaceState(null, "", url);
      document.documentElement.removeAttribute("data-list-query");
      runWith(storageWith(null));
      expect(document.documentElement.hasAttribute("data-list-query"), url).toBe(expected);
    }
    window.history.replaceState(null, "", "/");
    document.documentElement.removeAttribute("data-list-query");
  });

  it("ставить data-theme зі сховища", () => {
    expect(runWith(storageWith("light"))).toBe("light");
    expect(runWith(storageWith("dark"))).toBe("dark");
  });

  it("позначає, що JS працює (data-js), навіть без сховища", () => {
    runWith(throwingStorage);
    expect(document.documentElement.hasAttribute("data-js")).toBe(true);
  });

  it("ігнорує сміття й недоступне сховище", () => {
    expect(runWith(storageWith("<img onerror=1>"))).toBeNull();
    expect(runWith(throwingStorage)).toBeNull();
  });
});

describe("restoreHtmlAttributes", () => {
  it("ставить data-js і збережену тему; без вибору — лише data-js", () => {
    const el = document.createElement("html");
    restoreHtmlAttributes(el, storageWith("dark"));
    expect(el.getAttribute("data-js")).toBe("");
    expect(el.getAttribute("data-theme")).toBe("dark");
    const el2 = document.createElement("html");
    restoreHtmlAttributes(el2, null);
    expect(el2.hasAttribute("data-js")).toBe(true);
    expect(el2.hasAttribute("data-theme")).toBe(false);
  });
});
