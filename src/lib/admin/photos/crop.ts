/**
 * Кадри — точні порти scripts/curated (Pillow) на цілі пікселі. Повертають прямокутник {left, top, width, height}
 * для sharp().extract(). Без залежностей — їх перевіряють unit-тести на тих самих числах, що й Python.
 */
export type Box = { left: number; top: number; width: number; height: number };
export type Focus = { x: number; y: number };

/** «55% 40%» → {x: 0.55, y: 0.4}; сміття — центр. */
export function parseFocus(value: string | undefined | null): Focus {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%\s*$/.exec(value ?? "");
  if (!m) return { x: 0.5, y: 0.5 };
  const clamp = (v: number) => Math.min(1, Math.max(0, v / 100));
  return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) };
}

export const focusString = (f: Focus) => `${Math.round(f.x * 100)}% ${Math.round(f.y * 100)}%`;

/** driver_portraits.py square_top: квадрат по центру; портрет — з верхньої частини, на 5% нижче краю. */
export function squareTop(w: number, h: number): Box {
  const s = Math.min(w, h);
  const left = Math.floor((w - s) / 2);
  const top = h > w ? Math.min(Math.trunc(h * 0.05), h - s) : 0;
  return { left, top, width: s, height: s };
}

/** season_photos.py square: квадрат зі стороною = менша сторона, зсунутий до точки (як object-position). */
export function squareFocus(w: number, h: number, f: Focus): Box {
  const side = Math.min(w, h);
  // Python round() — банківське; на цілих пікселях різниця ≤ 1 px, тож Math.round достатньо.
  return { left: Math.round((w - side) * f.x), top: Math.round((h - side) * f.y), width: side, height: side };
}

/** driver_hero.py crop_4x5: зашироке — центр по горизонталі; зависоке — зрізаємо зверху FOCUS_Y частки зайвого. */
export function crop4x5(w: number, h: number, focusY = 0.2): Box {
  if (w * 5 > h * 4) {
    const cw = Math.floor((h * 4) / 5);
    return { left: Math.floor((w - cw) / 2), top: 0, width: cw, height: h };
  }
  const ch = Math.floor((w * 5) / 4);
  return { left: 0, top: Math.trunc((h - ch) * focusY), width: w, height: ch };
}

/** Довільне співвідношення (картка команди 16:10) з точкою фокусу. */
export function cropRatio(w: number, h: number, ratio: number, f: Focus): Box {
  if (w / h > ratio) {
    const cw = Math.round(h * ratio);
    return { left: Math.round((w - cw) * f.x), top: 0, width: cw, height: h };
  }
  const ch = Math.round(w / ratio);
  return { left: 0, top: Math.round((h - ch) * f.y), width: w, height: ch };
}
