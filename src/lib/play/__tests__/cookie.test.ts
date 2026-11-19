import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, decodeSession, encodeSession, sessionCookieOptions } from "../cookie";

describe("cookie сесії відвідувача", () => {
  it("кругова передача пари токенів", () => {
    const pair = { a: "eyJ.access.token", r: "refresh-token" };
    expect(decodeSession(encodeSession(pair))).toEqual(pair);
  });
  it("сміття, порожнє, зайві поля й завеликі значення — null", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("not-base64-json!")).toBeNull();
    expect(decodeSession(Buffer.from('{"a":1,"r":"x"}').toString("base64url"))).toBeNull();
    expect(decodeSession(Buffer.from('{"a":"","r":"x"}').toString("base64url"))).toBeNull();
    expect(decodeSession(Buffer.from('["a","r"]').toString("base64url"))).toBeNull();
    expect(decodeSession("a".repeat(6001))).toBeNull();
  });
  it("__Host-: Secure, Path=/, без Domain, httpOnly", () => {
    expect(SESSION_COOKIE.startsWith("__Host-")).toBe(true);
    expect(sessionCookieOptions).toMatchObject({ httpOnly: true, secure: true, path: "/", sameSite: "lax" });
    expect(sessionCookieOptions).not.toHaveProperty("domain");
  });
  it("реальний розмір: пара ES256 access (~1,2 КБ) + refresh вміщається в 4 КБ", () => {
    const access = `${"x".repeat(1300)}`;
    expect(encodeSession({ a: access, r: "r".repeat(20) }).length).toBeLessThan(2200);
  });
});
