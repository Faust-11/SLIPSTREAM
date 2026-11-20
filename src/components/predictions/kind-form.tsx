"use client";

import { useId, useState, type FormEvent } from "react";
import { postJson } from "@/components/auth/post";
import { fill } from "@/i18n/fill";
import type { PickDriver, PickTeam } from "@/lib/data/predictions";
import { REQUIRED_SLOTS, SLOTS, type Picks, type PredictionKind } from "@/lib/play/predictions";
import type { PredictionsText, SavedPrediction } from "./types";

type ErrorKey = keyof PredictionsText["round"]["errors"];
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; reason: ErrorKey };

const EMPTY: Picks = Array.from({ length: SLOTS }, () => null);

/** «Усі фінішують» → "all", команда → її id, не вказано → "". */
const dnfValue = (s: SavedPrediction | null) => (s ? (s.allFinish ? "all" : s.dnfTeam ? String(s.dnfTeam) : "") : "");
const snapshot = (picks: Picks, dnf: string) => JSON.stringify([picks, dnf]);

/** Статус відповіді сервера → ключ тексту помилки. */
function errorOf(status: number, error: unknown): ErrorKey {
  if (status === 409) return "closed";
  if (status === 401) return "unauthorized";
  if (status === 429) return "rateLimited";
  if (status === 403) return error === "no_profile" ? "noProfile" : "blocked";
  if (status === 400) return "invalid";
  return "unavailable";
}

/**
 * Форма прогнозу одного виду (Q — кваліфікація, R — гонка + команда без фінішу): 10 нативних <select> — клавіатура, екранні
 * читачі й системний вибір на телефоні працюють «з коробки», без перетягування. Пілот, уже обраний на іншому місці, не
 * блокується, а міняється місцем з поточним значенням: дублів не буває і нічого не треба спершу «звільняти».
 * Зберігає лише сервер (/api/predictions → play.save_prediction); дедлайн перевіряє база — відповідь 409 перемикає сторінку
 * в режим «лише перегляд» (onClosed).
 */
export function KindForm({ kind, year, round, drivers, teams, initial, text, onClosed, onNoProfile }: {
  kind: PredictionKind;
  year: number;
  round: number;
  drivers: PickDriver[];
  teams: PickTeam[];
  initial: SavedPrediction | null;
  text: PredictionsText;
  /** Сервер відповів «закрито» — сторінці треба перечитати стан етапу. */
  onClosed: () => void;
  /** Сервер відповів «немає профілю» (нік зник) — сторінці треба перечитати стан. */
  onNoProfile: () => void;
}) {
  const uid = useId();
  const t = text.round;
  const [picks, setPicks] = useState<Picks>(() => initial?.picks ?? EMPTY);
  const [dnf, setDnf] = useState(() => dnfValue(initial));
  const [saved, setSaved] = useState<string | null>(() => (initial ? snapshot(initial.picks, dnfValue(initial)) : null));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const dirty = snapshot(picks, dnf) !== (saved ?? snapshot(EMPTY, ""));
  const missing = (i: number) => i < REQUIRED_SLOTS && picks[i] === null;

  function choose(slot: number, value: string) {
    const id = value === "" ? null : Number(value);
    setPicks((prev) => {
      const next = [...prev];
      const at = id === null ? -1 : next.indexOf(id);
      if (at >= 0 && at !== slot) next[at] = next[slot] ?? null; // обмін місцями
      next[slot] = id;
      return next;
    });
    if (status.kind !== "saving") setStatus({ kind: "idle" });
  }

  function fillFromStandings() {
    const top = drivers.filter((d) => d.position !== null).slice(0, SLOTS).map((d) => d.id);
    setPicks(Array.from({ length: SLOTS }, (_, i) => top[i] ?? null));
    setStatus({ kind: "idle" });
  }

  function clear() {
    setPicks(EMPTY);
    setDnf("");
    setStatus({ kind: "idle" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (status.kind === "saving") return;
    if (picks.slice(0, REQUIRED_SLOTS).some((p) => p === null)) {
      setStatus({ kind: "error", reason: "required" });
      document.getElementById(`${uid}-${picks.findIndex((p, i) => i < REQUIRED_SLOTS && p === null)}`)?.focus();
      return;
    }
    setStatus({ kind: "saving" });
    const sent = snapshot(picks, dnf);
    const res = await postJson<{ error?: string }>("/api/predictions", {
      year,
      round,
      kind,
      picks,
      dnfTeam: kind === "R" && dnf !== "" && dnf !== "all" ? Number(dnf) : null,
      allFinish: kind === "R" && dnf === "all",
    });
    if (res.status === 200) {
      setSaved(sent);
      setStatus({ kind: "saved" });
      return;
    }
    const reason = errorOf(res.status, res.body.error);
    setStatus({ kind: "error", reason });
    if (reason === "closed") onClosed();
    if (reason === "noProfile") onNoProfile();
  }

  const label = (d: PickDriver, slot: number) => {
    const at = picks.indexOf(d.id);
    const where = at >= 0 && at !== slot ? ` (${fill(t.takenAt, { n: at + 1 })})` : "";
    return `${d.short}${d.teamName ? ` — ${d.teamName}` : ""}${where}`;
  };

  const message =
    status.kind === "saving" ? t.saving : status.kind === "saved" && !dirty ? t.saved : dirty && (saved !== null || picks.some((p) => p !== null)) ? t.dirty : "";

  return (
    <section className="au-card pd-card" aria-labelledby={`${uid}-h`}>
      <h2 className="au-h" id={`${uid}-h`}>
        {t.kinds[kind].h}
      </h2>
      <p className="au-hint">{t.kinds[kind].hint}</p>
      <form className="pd-form" onSubmit={submit} noValidate>
        <ol className="pd-slots">
          {picks.map((pick, i) => {
            const chosen = pick === null ? undefined : byId.get(pick);
            const invalid = status.kind === "error" && status.reason === "required" && missing(i);
            return (
              <li className="pd-slot" key={i}>
                <label htmlFor={`${uid}-${i}`}>
                  {fill(t.slot, { n: i + 1 })}
                  {i < REQUIRED_SLOTS ? <span className="pd-req"> · {t.required}</span> : null}
                </label>
                <div className="pd-pick">
                  <span className="pd-dot" style={chosen ? { background: chosen.color } : undefined} aria-hidden="true" />
                  <select
                    id={`${uid}-${i}`}
                    name={`${kind}-p${i + 1}`}
                    className="pd-select"
                    value={pick === null ? "" : String(pick)}
                    aria-invalid={invalid || undefined}
                    onChange={(e) => choose(i, e.target.value)}
                  >
                    <option value="">{i < REQUIRED_SLOTS ? t.choose : t.none}</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {label(d, i)}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="au-hint">{t.swapHint}</p>

        {kind === "R" ? (
          <div className="pd-dnf">
            <label className="au-label" htmlFor={`${uid}-dnf`}>
              {t.dnf.label}
            </label>
            <div className="pd-pick">
              <span className="pd-dot" style={{ background: teams.find((x) => String(x.id) === dnf)?.color }} aria-hidden="true" />
              <select
                id={`${uid}-dnf`}
                name="R-dnf-team"
                className="pd-select"
                value={dnf}
                aria-describedby={`${uid}-dnf-hint`}
                onChange={(e) => {
                  setDnf(e.target.value);
                  if (status.kind !== "saving") setStatus({ kind: "idle" });
                }}
              >
                <option value="">{t.dnf.none}</option>
                <option value="all">{t.dnf.all}</option>
                {teams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="au-hint" id={`${uid}-dnf-hint`}>
              {t.dnf.hint}
            </p>
          </div>
        ) : null}

        <div className="au-actions">
          <button className="btn au-btn" type="submit" disabled={status.kind === "saving"}>
            {status.kind === "saving" ? t.saving : t.save[kind]}
          </button>
          <button className="btn btn-ghost au-btn" type="button" onClick={fillFromStandings}>
            {t.fillStandings}
          </button>
          <button className="btn btn-ghost au-btn" type="button" onClick={clear}>
            {t.clear}
          </button>
        </div>
        <p className="au-ok" role="status">
          {message}
        </p>
        <p className="au-err" role="alert">
          {status.kind === "error" ? t.errors[status.reason] : null}
        </p>
      </form>
    </section>
  );
}
