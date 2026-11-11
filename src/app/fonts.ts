// Змінні --nf-* (не --font-*): --font-* займає @theme Tailwind, інакше цикл var() і порожні шрифти поза [lang].
import { IBM_Plex_Mono, IBM_Plex_Sans, Rubik_Mono_One } from "next/font/google";

// Кирилиця є в усіх трьох (next/font font-data.json: Rubik Mono One — cyrillic, latin, latin-ext).
// subsets — лише те, що ПЕРЕДЗАВАНТАЖУЄТЬСЯ (docs font.md, `subsets`). Кирилиця не передзавантажується:
// 4 файли (78 КБ) ділили повільний канал із CSS і відсували перший кадр (Lighthouse devtools-троттлінг,
// 11.11: CSS «Команд» до 1,97 с проти 1,4 с на головній). @font-face кирилиці лишається — завантаження
// за потребою на UK-сторінках (замір у e2e «шрифти: … кириличні накреслення»).
export const displayFont = Rubik_Mono_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--nf-display",
  display: "swap",
});

// Змінний шрифт: один файл на всі накреслення 400–700.
export const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--nf-body",
  display: "swap",
});

export const monoFont = IBM_Plex_Mono({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--nf-mono",
  display: "swap",
  // Моно — дрібні підписи нижче першого екрана; не займаємо мережу на старті.
  preload: false,
});

export const fontVariables = `${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
