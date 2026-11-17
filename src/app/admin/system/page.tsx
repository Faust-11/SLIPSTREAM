import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Система" };

export default async function AdminSystem() {
  const admin = await requireAdmin();
  return (
    <section className="ad-view" aria-labelledby="ad-h">
      <header className="ad-vh">
        <div>
          <p className="ad-crumb">Адмінка</p>
          <h1 id="ad-h" className="display">
            Система
          </h1>
        </div>
      </header>
      <div className="ad-grid2">
        <section className="ad-panel">
          <h2>Адміністратори</h2>
          <ul className="ad-people">
            <li>
              <span className="ad-av" aria-hidden="true">
                {admin.label.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <b>{admin.label}</b>
                <small>Власник · вхід {admin.sub.startsWith("github:") ? "через GitHub" : "кодом на пошту"}</small>
              </div>
            </li>
          </ul>
          <p className="ad-note">
            Хто може увійти — змінні у Vercel: ADMIN_GITHUB_IDS (id акаунтів GitHub) і ADMIN_EMAILS (адреси для коду). Прибрали
            звідти — сесія перестає діяти одразу.
          </p>
        </section>
        <section className="ad-panel">
          <h2>Як захищено</h2>
          <ul className="ad-att ad-plain">
            <li>
              <b>Сторонні адмінки не бачать</b>
              <span>Без входу кожна адреса /admin відповідає звичайною сторінкою 404 сайту.</span>
            </li>
            <li>
              <b>Вхід лише для списку</b>
              <span>
                Акаунт GitHub зі списку або код на пошту зі списку (8 символів, 10 хвилин, лише в тому браузері, де
                запитали). Лише з основної адреси сайту за посиланням із ключем. Сесія — 12 годин, у захищеному cookie.
              </span>
            </li>
            <li>
              <b>Перевірка на кожній дії</b>
              <span>Кожна сторінка й кожна дія адмінки перевіряє сесію на сервері, а не лише при вході.</span>
            </li>
            <li>
              <b>Ключі — лише на сервері</b>
              <span>Ключі GitHub і пошти та токен для публікації ніколи не потрапляють у браузер.</span>
            </li>
            <li>
              <b>Усе — через git</b>
              <span>Кожна правка — PR у репозиторії: видно, хто, що й коли змінив; будь-яку можна відкотити.</span>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
