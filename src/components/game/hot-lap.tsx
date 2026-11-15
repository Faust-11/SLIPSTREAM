"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { fill } from "@/i18n/fill";
import { fmtLap, fmtSec, type TrackKey } from "@/lib/game/physics";
import { HotLapEngine } from "./engine";

export type Labels = Dictionary["gamePage"];
export type TrackCard = { key: TrackKey; points: string; start: [number, number]; length: string; width: string; bot: string };

/** Колір тегу картки (з макета). */
const TAG: Record<TrackKey, string> = { lyman: "#4FD18B", port: "#B9BDC5", plateau: "#FF8000", forest: "#93A8FF" };

export function HotLap({ cards, labels: L, locale }: { cards: TrackCard[]; labels: Labels; locale: Locale }) {
  const [engine] = useState(() => new HotLapEngine());
  const snap = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getServerSnapshot);
  const { key, phase, result, laps, bestTotal, botTotal, preferBot, cardBests, mounted } = snap;
  const [shareMsg, setShareMsg] = useState<{ for: unknown; text: string } | null>(null);

  const gameRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const kmhRef = useRef<HTMLElement>(null);
  const deltaRef = useRef<HTMLDivElement>(null);
  const reactRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const lightsRef = useRef<HTMLDivElement>(null);
  const s1 = useRef<HTMLDivElement>(null);
  const s2 = useRef<HTMLDivElement>(null);
  const s3 = useRef<HTMLDivElement>(null);
  const sRefs = [s1, s2, s3];
  const againRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    engine.setLabels({ react: L.react, s: L.s, off: L.off });
  }, [engine, L]);

  useEffect(() => {
    const els = [gameRef, viewRef, miniRef, timeRef, kmhRef, deltaRef, reactRef, toastRef, lightsRef, s1, s2, s3].map((r) => r.current);
    if (els.some((x) => !x)) return;
    return engine.attach({
      game: gameRef.current!,
      view: viewRef.current!,
      mini: miniRef.current!,
      time: timeRef.current!,
      kmh: kmhRef.current!,
      delta: deltaRef.current!,
      react: reactRef.current!,
      toast: toastRef.current!,
      lights: lightsRef.current!,
      sectors: [s1.current!, s2.current!, s3.current!],
    });
  }, [engine]);

  // Після кола фокус — на «Ще коло» (як у макеті): Пробіл/Enter одразу запускає новий заїзд.
  useEffect(() => {
    if (phase === "done") againRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const share = async () => {
    if (!result) return;
    const text = fill(L.shareText, { track: L.tracks[key].name, time: fmtLap(result.t) });
    const url = `${window.location.origin}${window.location.pathname}#${key}`;
    // Системне меню (телефон); якщо його немає або воно відмовило не через «Скасувати» — копіювання в буфер.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShareMsg({ for: result, text: L.copied });
    } catch {
      setShareMsg({ for: result, text: L.copyFail });
    }
  };

  const touch = (bit: number) => {
    const off = (ev: React.PointerEvent<HTMLButtonElement>) => {
      ev.currentTarget.classList.remove("is-pressed");
      engine.press(bit, false);
    };
    return {
      onPointerDown: (ev: React.PointerEvent<HTMLButtonElement>) => {
        ev.preventDefault();
        ev.currentTarget.setPointerCapture?.(ev.pointerId);
        ev.currentTarget.classList.add("is-pressed");
        engine.press(bit, true);
      },
      onPointerUp: off,
      onPointerCancel: off,
      onLostPointerCapture: off,
      onContextMenu: (ev: React.MouseEvent) => ev.preventDefault(),
    };
  };

  const pick = (k: TrackKey) => {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${k}`);
    engine.selectTrack(k);
    document.getElementById("gm-play")?.scrollIntoView({ block: "start" });
    gameRef.current?.focus({ preventScroll: true });
  };

  const T = L.tracks[key];
  const card = cards.find((c) => c.key === key)!;
  const useBot = preferBot || bestTotal === null;
  const timeFmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "uk-UA", { hour: "2-digit", minute: "2-digit" });

  let resultText = "";
  if (result) {
    const diff = result.prevBest !== null ? result.t - result.prevBest : null;
    resultText =
      (result.pen ? `${fill(L.pen, { n: result.pen })} ` : "") +
      (diff !== null ? (diff < 0 ? fill(L.faster, { d: fmtSec(-diff) }) : fill(L.slower, { best: fmtLap(result.prevBest!), d: fmtSec(diff) })) : L.ghostNow);
    if (botTotal !== null) resultText += ` ${fill(result.t < botTotal ? L.botWin : L.botLose, { d: fmtSec(Math.abs(result.t - botTotal)) })}`;
  }

  return (
    <>
      <section className="gm-sec" aria-labelledby="gm-pick-h">
        <div className="wrap">
          <div className="gm-sec-head">
            <h2 className="display" id="gm-pick-h">
              {L.circuits}
            </h2>
          </div>
          <div className="gm-picker">
            {cards.map((c) => {
              const t = L.tracks[c.key];
              const b = cardBests[c.key];
              return (
                <button
                  key={c.key}
                  type="button"
                  className="gm-tcard"
                  aria-pressed={mounted ? c.key === key : undefined}
                  style={{ "--gm-tc": TAG[c.key] } as CSSProperties}
                  onClick={() => pick(c.key)}
                >
                  <svg viewBox="0 0 160 100" aria-hidden="true">
                    <polygon className="gm-tline" points={c.points} />
                    <circle className="gm-tstart" cx={c.start[0]} cy={c.start[1]} r="5.5" />
                  </svg>
                  <span className="gm-thead">
                    <span className="gm-tname">{t.name}</span>
                    <span className="gm-ttag">{t.tag}</span>
                  </span>
                  <span className="gm-tdesc">{t.desc}</span>
                  <span className="gm-tmeta">
                    <span>
                      <span className="gm-tk">{L.length}</span>
                      <b>{c.length}</b>
                    </span>
                    <span>
                      <span className="gm-tk">{L.bot}</span>
                      <b>{c.bot}</b>
                    </span>
                    <span>
                      <span className="gm-tk">{L.record}</span>
                      <b data-best>{b ? fmtLap(b) : "—"}</b>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="gm-sec gm-play" id="gm-play" aria-label={L.playLabel}>
        {/* Постійний live-регіон: результат кола оголошується скрінрідером (оверлей монтується разом із текстом —
            такий регіон більшість скрінрідерів не оголошує, рев'ю PR #26). */}
        <p className="sr-only" role="status">
          {phase === "done" && result ? `${result.isBest ? (result.prevBest === null ? L.first : L.newBest) : L.done}: ${fmtLap(result.t)}. ${resultText}` : ""}
        </p>
        <div className="wrap">
          <div className="gm-grid">
            <div className={`gm-game${phase === "lights" || phase === "run" ? " is-running" : ""}`} ref={gameRef} tabIndex={0} role="application" aria-label={L.gameLabel} aria-roledescription={L.playLabel}>
              <canvas className="gm-view" ref={viewRef} />
              <canvas className="gm-mini" ref={miniRef} aria-hidden="true" />
              <div className="gm-hud" aria-hidden="true">
                <div className="gm-clock" ref={timeRef}>
                  0:00.000
                </div>
                <div className="gm-row">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="gm-chip" ref={sRefs[i]}>
                      <small>S{i + 1}</small>—
                    </div>
                  ))}
                </div>
                <div className="gm-row">
                  <div className="gm-chip" ref={deltaRef} hidden />
                  <div className="gm-chip" ref={reactRef} hidden />
                </div>
              </div>
              <div className="gm-lights" ref={lightsRef} hidden aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} className="gm-lamp" />
                ))}
              </div>
              <div className="gm-toast" ref={toastRef} hidden aria-hidden="true" />
              <div className="gm-trk" aria-hidden="true">
                {T.name}
                <small>
                  {card.length} · {T.tag}
                </small>
              </div>
              <div className="gm-speed" aria-hidden="true">
                <strong ref={kmhRef}>0</strong>
                <span>{L.kmh}</span>
              </div>
              <div className="gm-touch">
                <div>
                  <button type="button" aria-label={L.left} tabIndex={-1} {...touch(4)}>
                    ◀
                  </button>
                  <button type="button" aria-label={L.right} tabIndex={-1} {...touch(8)}>
                    ▶
                  </button>
                </div>
                <div>
                  <button type="button" aria-label={L.brake} tabIndex={-1} {...touch(2)}>
                    ■
                  </button>
                  <button type="button" aria-label={L.throttle} tabIndex={-1} {...touch(1)}>
                    ▲
                  </button>
                </div>
              </div>
              {(phase === "ready" || phase === "done") && (
                <div className="gm-overlay">
                  <div className="gm-card">
                    {phase === "ready" || !result ? (
                      <>
                        <div className="gm-eyb">
                          {T.name} · {T.tag}
                        </div>
                        <h2>{L.ready}</h2>
                        <p>{L.readyP}</p>
                        <div className="gm-btns">
                          <button type="button" className="gm-btn is-go" onClick={engine.start} disabled={!mounted}>
                            {L.start}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="gm-eyb">{T.name}</div>
                        <h2>{result.isBest ? (result.prevBest === null ? L.first : L.newBest) : L.done}</h2>
                        <div className="gm-result">{fmtLap(result.t)}</div>
                        <p>{resultText}</p>
                        <div className="gm-btns">
                          <button type="button" className="gm-btn is-go" onClick={engine.start} ref={againRef}>
                            {L.again}
                          </button>
                          <button type="button" className="gm-btn gm-side-btn" onClick={share}>
                            {L.share}
                          </button>
                        </div>
                        <p className="gm-share-msg" role="status">
                          {shareMsg?.for === result ? shareMsg.text : null}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
              <noscript>
                <div className="gm-overlay">
                  <div className="gm-card">
                    <p>{L.noscript}</p>
                  </div>
                </div>
              </noscript>
            </div>

            <aside className="gm-aside">
              <section className="gm-sheet">
                <h3>{fill(L.laps, { track: T.name })}</h3>
                <ul className="gm-laps">
                  {laps.length === 0 ? (
                    <li className="gm-muted">{L.none}</li>
                  ) : (
                    laps.map((l, i) => {
                      const isB = l.t === bestTotal;
                      return (
                        <li key={`${l.at}-${i}`} className={isB ? "is-best" : undefined}>
                          <span>
                            {isB ? "★ " : ""}
                            {fmtLap(l.t)}
                          </span>
                          <span className="gm-muted">{l.pen ? fill(L.penS, { n: l.pen }) : timeFmt.format(l.at)}</span>
                        </li>
                      );
                    })
                  )}
                </ul>
                <p className="gm-note">{L.accountNote}</p>
              </section>
              <section className="gm-sheet">
                <h3 id="gm-ghost-h">{L.ghostH}</h3>
                <div className="gm-seg" role="group" aria-labelledby="gm-ghost-h">
                  <button type="button" className="gm-side-btn" aria-pressed={!useBot} disabled={bestTotal === null} onClick={() => engine.setGhost(false)}>
                    {L.gBest}
                  </button>
                  <button type="button" className="gm-side-btn" aria-pressed={useBot} onClick={() => engine.setGhost(true)}>
                    {L.gBot}
                  </button>
                </div>
                <p className="gm-note">
                  {preferBot && bestTotal !== null ? fill(L.gNoteBot, { t: botTotal !== null ? fmtLap(botTotal) : "—" }) : bestTotal !== null ? L.gNoteBest : L.gNoteNoBest}
                </p>
              </section>
              <section className="gm-sheet">
                <h3>{L.controlsH}</h3>
                <div className="gm-keys">
                  <span>
                    <kbd>↑</kbd> <kbd>W</kbd>
                  </span>
                  <span>{L.throttle}</span>
                  <span>
                    <kbd>↓</kbd> <kbd>S</kbd>
                  </span>
                  <span>{L.brake}</span>
                  <span>
                    <kbd>←</kbd>
                    <kbd>→</kbd>
                  </span>
                  <span>{L.steer}</span>
                  <span>
                    <kbd>R</kbd>
                  </span>
                  <span>{L.restart}</span>
                  <span>
                    <kbd>C</kbd>
                  </span>
                  <span>{L.camera}</span>
                </div>
              </section>
              <section className="gm-sheet">
                <h3>{L.colorsH}</h3>
                <div className="gm-legend">
                  <span className="is-purple">{L.purple}</span>
                  <span className="is-green">{L.green}</span>
                  <span className="is-yellow">{L.yellow}</span>
                </div>
              </section>
              <section className="gm-sheet">
                <h3>{fill(L.spec, { track: T.name })}</h3>
                <dl className="gm-spec">
                  <dt>{L.length}</dt>
                  <dd>{card.length}</dd>
                  <dt>{L.width}</dt>
                  <dd>{card.width}</dd>
                  <dt>{L.botT}</dt>
                  <dd>{botTotal !== null ? fmtLap(botTotal) : "—"}</dd>
                  <dt>{L.you}</dt>
                  <dd>{bestTotal !== null ? fmtLap(bestTotal) : "—"}</dd>
                </dl>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
