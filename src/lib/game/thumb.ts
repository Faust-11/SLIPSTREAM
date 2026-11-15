import { TRACK_SPECS, type TrackKey } from "./physics";

/**
 * Схема траси для картки: опорні точки, вписані в 150×86 у центрі viewBox 160×100 (так рахував макет — звірено
 * з його SVG: Лиман (45.8, 7.0), Бір (70.0, 20.1)). Рахується на сервері, клієнт отримує готовий рядок.
 */
export function trackThumb(key: TrackKey): { points: string; start: [number, number] } {
  const raw = TRACK_SPECS[key].raw;
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const k = Math.min(150 / w, 86 / h);
  const ox = (160 - w * k) / 2;
  const oy = (100 - h * k) / 2;
  const pt = (p: [number, number]): [number, number] => [Math.round((ox + (p[0] - minX) * k) * 10) / 10, Math.round((oy + (p[1] - minY) * k) * 10) / 10];
  return { points: raw.map((p) => pt(p).join(",")).join(" "), start: pt(raw[0]!) };
}
