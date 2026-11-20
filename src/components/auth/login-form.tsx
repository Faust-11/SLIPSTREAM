"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fill } from "@/i18n/fill";
import { isValidCode, isValidEmail, normalizeEmail, safeNext } from "@/lib/play/validate";
import { refreshAccount } from "./account-store";
import { NickForm, type NickText } from "./nick-form";
import { postJson } from "./post";

export type LoginText = {
  lead: string;
  emailLabel: string;
  send: string;
  sending: string;
  codeH: string;
  codeSent: string;
  codeLabel: string;
  codeHint: string;
  verify: string;
  verifying: string;
  resend: string;
  resendWait: string;
  change: string;
  resent: string;
  privacy: string;
  errors: Record<"invalidEmail" | "invalidCode" | "rateLimited" | "unavailable" | "generic", string>;
};

/** Пауза перед повторним листом — збігається з паузою Supabase на адресу (60 с). */
const RESEND_S = 60;

type Step = "email" | "code" | "nick";

export function LoginForm({ text, nick, fallbackHref }: { text: LoginText; nick: NickText; fallbackHref: string }) {
  const router = useRouter();
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  /** Куди вести після входу: ?next= (лише відносний шлях цього сайту) або профіль. Читаємо в момент переходу — сторінка лишається статичною. */
  const target = () => safeNext(new URLSearchParams(window.location.search).get("next")) ?? fallbackHref;

  // Відлік до повторної відправки: один інтервал, поки wait > 0.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    (step === "email" ? emailRef : codeRef).current?.focus();
  }, [step]);

  function failure(status: number, body: { error?: string }) {
    if (body.error === "invalid_email") return text.errors.invalidEmail;
    if (body.error === "invalid_code") return text.errors.invalidCode;
    if (status === 429 || body.error === "rate_limited") return text.errors.rateLimited;
    if (status === 0 || status === 503 || body.error === "unavailable") return text.errors.unavailable;
    return text.errors.generic;
  }

  async function sendCode(resend: boolean) {
    const addr = normalizeEmail(email);
    if (!isValidEmail(addr)) {
      setError(text.errors.invalidEmail);
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await postJson<{ error?: string }>("/api/auth/code", { email: addr });
    setBusy(false);
    if (res.status !== 200) return setError(failure(res.status, res.body));
    setEmail(addr);
    setWait(RESEND_S);
    if (resend) setInfo(text.resent);
    setCode("");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const digits = code.replace(/\s/g, "");
    if (!isValidCode(digits)) {
      setError(text.errors.invalidCode);
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson<{ error?: string; nick?: string | null }>("/api/auth/verify", { email, code: digits });
    if (res.status !== 200) {
      setBusy(false);
      setError(failure(res.status, res.body));
      codeRef.current?.focus();
      return;
    }
    await refreshAccount();
    setBusy(false);
    if (res.body.nick) router.push(target());
    else setStep("nick");
  }

  if (step === "nick") {
    return (
      <div className="au-card">
        <NickForm text={nick} onDone={() => router.push(target())} autoFocus />
      </div>
    );
  }

  if (step === "code") {
    return (
      <form className="au-card au-form" onSubmit={verify} noValidate>
        <h2 className="au-h">{text.codeH}</h2>
        <p className="au-note">{fill(text.codeSent, { email })}</p>
        <label className="au-label" htmlFor={`${id}-code`}>
          {text.codeLabel}
        </label>
        <input
          ref={codeRef}
          id={`${id}-code`}
          className="au-input au-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
          aria-invalid={error ? true : undefined}
        />
        <p className="au-hint" id={`${id}-hint`}>
          {text.codeHint}
        </p>
        <p className="au-err" id={`${id}-err`} role="alert">
          {error}
        </p>
        <p className="au-ok" role="status">
          {info}
        </p>
        <div className="au-actions">
          <button className="btn au-btn" type="submit" disabled={busy}>
            {busy ? text.verifying : text.verify}
          </button>
          <button className="btn btn-ghost au-btn" type="button" disabled={busy || wait > 0} onClick={() => sendCode(true)}>
            {wait > 0 ? fill(text.resendWait, { s: wait }) : text.resend}
          </button>
          <button
            className="au-linkbtn"
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
              setInfo(null);
            }}
          >
            {text.change}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="au-card au-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void sendCode(false);
      }}
      noValidate
    >
      <label className="au-label" htmlFor={`${id}-email`}>
        {text.emailLabel}
      </label>
      <input
        ref={emailRef}
        id={`${id}-email`}
        className="au-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
        aria-invalid={error ? true : undefined}
      />
      <p className="au-hint" id={`${id}-hint`}>
        {text.privacy}
      </p>
      <p className="au-err" id={`${id}-err`} role="alert">
        {error}
      </p>
      <button className="btn au-btn" type="submit" disabled={busy}>
        {busy ? text.sending : text.send}
      </button>
    </form>
  );
}
