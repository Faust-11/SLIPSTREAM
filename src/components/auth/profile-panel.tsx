"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { setAnonymous, useAccount } from "./account-store";
import { NickForm, type NickText } from "./nick-form";
import { postJson } from "./post";

export type ProfileText = {
  loading: string;
  signedOutH: string;
  signedOutText: string;
  signIn: string;
  nickLabel: string;
  change: string;
  signOut: string;
  signingOut: string;
  unavailable: string;
  deleteH: string;
  deleteText: string;
  deleteBtn: string;
  deleteConfirmH: string;
  deleteConfirmText: string;
  deleteCheck: string;
  deleteDo: string;
  deleteDoing: string;
  cancel: string;
  deleted: string;
  deletedBlocked: string;
  deleteError: string;
  home: string;
};

export function ProfilePanel({ text, nick, loginHref, homeHref }: { text: ProfileText; nick: NickText; loginHref: string; homeHref: string }) {
  const account = useAccount();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [done, setDone] = useState<null | "deleted" | "data_only_blocked">(null);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    const res = await postJson("/api/auth/logout", {});
    setSigningOut(false);
    // Не вийшло (мережа, 5xx) — cookie лишилась, тож «ви не ввійшли» було б неправдою (спільний комп'ютер): лишаємо стан і кажемо.
    if (res.status === 200) setAnonymous();
    else setSignOutError(true);
  }

  async function remove() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setDeleteError(false);
    const res = await postJson<{ kind?: "deleted" | "data_only_blocked" }>("/api/auth/delete", { confirm: true });
    setDeleting(false);
    if (res.status === 200 && res.body.kind) {
      dialog.current?.close();
      setAnonymous();
      setDone(res.body.kind);
    } else setDeleteError(true);
  }

  if (done) {
    return (
      <div className="au-card">
        <p className="au-note" role="status">
          {done === "deleted" ? text.deleted : text.deletedBlocked}
        </p>
        <Link className="btn au-btn" href={homeHref}>
          {text.home}
        </Link>
      </div>
    );
  }

  if (account.status === "loading") return <p className="au-note au-card" role="status">{text.loading}</p>;
  if (account.status === "unavailable") return <p className="au-err au-card" role="alert">{text.unavailable}</p>;

  if (account.status === "anon") {
    return (
      <div className="au-card">
        <h2 className="au-h">{text.signedOutH}</h2>
        <p className="au-note">{text.signedOutText}</p>
        <Link className="btn au-btn" href={loginHref}>
          {text.signIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="au-stack">
      <section className="au-card" aria-labelledby={`${id}-nick`}>
        {account.nick && !editing ? (
          <>
            <p className="au-label" id={`${id}-nick`}>
              {text.nickLabel}
            </p>
            <p className="au-nick">{account.nick}</p>
            <div className="au-actions">
              <button className="btn btn-ghost au-btn" type="button" onClick={() => setEditing(true)}>
                {text.change}
              </button>
              <button className="btn btn-ghost au-btn" type="button" onClick={signOut} disabled={signingOut}>
                {signingOut ? text.signingOut : text.signOut}
              </button>
            </div>
            <p className="au-err" role="alert">
              {signOutError ? text.unavailable : null}
            </p>
          </>
        ) : (
          <>
            <NickForm text={nick} initial={account.nick ?? ""} onDone={() => setEditing(false)} autoFocus={editing} />
            <div className="au-actions">
              <button className="btn btn-ghost au-btn" type="button" onClick={signOut} disabled={signingOut}>
                {signingOut ? text.signingOut : text.signOut}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="au-card au-danger" aria-labelledby={`${id}-del`}>
        <h2 className="au-h" id={`${id}-del`}>
          {text.deleteH}
        </h2>
        <p className="au-note">{text.deleteText}</p>
        <button
          className="btn btn-ghost au-btn"
          type="button"
          onClick={() => {
            setConfirmed(false);
            setDeleteError(false);
            dialog.current?.showModal();
          }}
        >
          {text.deleteBtn}
        </button>
        <dialog ref={dialog} className="au-dialog" aria-labelledby={`${id}-dh`}>
          <h2 className="au-h" id={`${id}-dh`}>
            {text.deleteConfirmH}
          </h2>
          <p className="au-note">{text.deleteConfirmText}</p>
          <label className="au-check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>{text.deleteCheck}</span>
          </label>
          <p className="au-err" role="alert">
            {deleteError ? text.deleteError : null}
          </p>
          <div className="au-actions">
            <button className="btn au-btn au-btn-danger" type="button" disabled={!confirmed || deleting} onClick={remove}>
              {deleting ? text.deleteDoing : text.deleteDo}
            </button>
            <button className="btn btn-ghost au-btn" type="button" onClick={() => dialog.current?.close()}>
              {text.cancel}
            </button>
          </div>
        </dialog>
      </section>
    </div>
  );
}
