"use client";

import { useState } from "react";

/**
 * Хайлайт гонки (YouTube FORMULA 1). До кліку — лише мініатюра й кнопка: без iframe плеєра (~1 МБ скриптів YouTube, TBT)
 * і без cookies; після кліку — youtube-nocookie.com з автозапуском. Мініатюра — i.ytimg.com (CSP img-src), розмір 16:9
 * зарезервовано — без зсуву макета.
 */
export function RaceVideo({ id, title, hd, playLabel }: { id: string; title: string; hd?: boolean; playLabel: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="rc-video">
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" className="rc-video-play" onClick={() => setOn(true)} aria-label={playLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            // 480 px розмивався на десктопі (до 960 px); 1280 px — лише коли є (hd, перевіряє race_videos.py).
            srcSet={hd ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg 480w, https://i.ytimg.com/vi/${id}/maxresdefault.jpg 1280w` : undefined}
            sizes={hd ? "(max-width: 1000px) 100vw, 960px" : undefined}
            alt=""
            width={480}
            height={360}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
          <span className="rc-video-icon" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
