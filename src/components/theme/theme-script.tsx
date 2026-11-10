import { themeScriptSource } from "@/lib/theme";

/** Inline у `<head>`: тема зі сховища ставиться до першого кадру (без мерехтіння). */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />;
}
