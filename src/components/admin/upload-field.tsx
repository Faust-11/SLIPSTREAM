"use client";

import { useRef, useState } from "react";
import { FocusPicker } from "./focus-picker";

/**
 * Власне фото: браузер зменшує до 2560 px і перекодовує в JPEG до відправлення (ліміт тіла функції Vercel 4,5 МБ;
 * заодно метадані — EXIF, GPS — не їдуть на сервер; сервер усе одно перекодовує без них). Орієнтацію з EXIF
 * застосовує createImageBitmap(imageOrientation: "from-image").
 */
const MAX_SIDE = 2560;

export function UploadField() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function onChange(file: File | undefined) {
    if (!file || !input.current) return;
    setNote("Готую фото…");
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * k);
      canvas.height = Math.round(bmp.height * k);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) throw new Error("toBlob");
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
      input.current.files = dt.files;
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      setNote(`${canvas.width}×${canvas.height} px, ${(blob.size / 1024 / 1024).toFixed(1)} МБ — без метаданих.`);
    } catch {
      input.current.value = "";
      setPreview(null);
      setNote("Цей файл не вдалося прочитати як фото (підходять JPEG, PNG, WebP).");
    }
  }

  return (
    <div className="ad-upload">
      <label className="ad-fld">
        <span>Файл</span>
        <input ref={input} type="file" name="file" accept="image/jpeg,image/png,image/webp" required onChange={(e) => onChange(e.currentTarget.files?.[0])} />
      </label>
      <p className="ad-note" role="status">
        {note}
      </p>
      {preview && <FocusPicker src={preview} alt="Вибране фото" />}
    </div>
  );
}
