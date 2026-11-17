"use client";

import { useState } from "react";

/**
 * Точка фокусу кадру: клік по фото або стрілки (крок 5%). Значення — у прихованих полях fx/fy (0–100) форми публікації;
 * сервер кадрує за нею (src/lib/admin/photos/crop.ts) і пише focusY для банерів (CSS object-position).
 */
export function FocusPicker({ src, alt, initial = { x: 50, y: 50 } }: { src: string; alt: string; initial?: { x: number; y: number } }) {
  const [f, setF] = useState(initial);
  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
  return (
    <div className="ad-focus">
      <button
        type="button"
        className="ad-focus-img"
        aria-label={`Точка фокусу: ${f.x}% по горизонталі, ${f.y}% по вертикалі. Клік по фото або стрілки — змінити.`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setF({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
        }}
        onKeyDown={(e) => {
          const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
          if (!d) return;
          e.preventDefault();
          setF((p) => ({ x: clamp(p.x + d[0]!), y: clamp(p.y + d[1]!) }));
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- прев'ю з Commons/blob: не через next/image (домени й розміри довільні) */}
        <img src={src} alt={alt} />
        <span className="ad-focus-dot" style={{ left: `${f.x}%`, top: `${f.y}%` }} aria-hidden="true" />
      </button>
      <input type="hidden" name="fx" value={f.x} />
      <input type="hidden" name="fy" value={f.y} />
      <p className="ad-note">
        Фокус: {f.x}% · {f.y}%. Для квадратів і 4:5 кадр зсувається до цієї точки; для банерів — сайт тримає її в кадрі.
      </p>
    </div>
  );
}
