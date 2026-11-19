"use client";

import { useId, useRef, useState } from "react";
import { nickProblem } from "@/lib/play/validate";
import { setNick as storeNick } from "./account-store";
import { postJson } from "./post";

export type NickText = {
  h: string;
  lead: string;
  label: string;
  hint: string;
  save: string;
  saving: string;
  saved: string;
  errors: Record<"short" | "long" | "chars" | "reserved" | "taken" | "invalid" | "blocked" | "unauthorized" | "unavailable" | "rateLimited", string>;
};

/** Вибір або зміна ніка: швидка перевірка формату на місці, остаточна — у базі (набір помилок з /api/auth/nick). */
export function NickForm({ text, initial = "", headingLevel = 2, onDone, autoFocus = false }: {
  text: NickText;
  initial?: string;
  headingLevel?: 2 | 3;
  onDone: (nick: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const H = `h${headingLevel}` as "h2" | "h3";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const nick = value.trim();
    const problem = nickProblem(nick);
    if (problem) {
      setError(text.errors[problem]);
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson<{ error?: string; problem?: string }>("/api/auth/nick", { nick });
    setBusy(false);
    if (res.status === 200) {
      storeNick(nick);
      onDone(nick);
      return;
    }
    const key = res.body.error === "rate_limited" ? "rateLimited" : res.body.error;
    const known = key && key in text.errors ? (key as keyof NickText["errors"]) : "unavailable";
    setError(text.errors[known]);
    input.current?.focus();
  }

  return (
    <form className="au-form" onSubmit={submit} noValidate>
      <H className="au-h">{text.h}</H>
      <p className="au-note">{text.lead}</p>
      <label className="au-label" htmlFor={`${id}-nick`}>
        {text.label}
      </label>
      <input
        ref={input}
        id={`${id}-nick`}
        className="au-input"
        type="text"
        name="nickname"
        autoComplete="nickname"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={48}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ""}`}
        aria-invalid={error ? true : undefined}
        autoFocus={autoFocus}
      />
      <p className="au-hint" id={`${id}-hint`}>
        {text.hint}
      </p>
      <p className="au-err" id={`${id}-err`} role="alert">
        {error}
      </p>
      <button className="btn au-btn" type="submit" disabled={busy}>
        {busy ? text.saving : text.save}
      </button>
    </form>
  );
}
