# ZUBI Tattoo: сайт zubitattoo.com

Сайт студії (PL / UA / EN / RU) з «Панеллю студії». Запис іде через Booksy.

## Що в папці
- `index.html`, `img/`, `fonts/`: сам сайт.
- `api/`: сервер (Vercel Functions):
  - `state`: дані для сторінки;
  - `admin`: панель студії;
  - `upload`: фото й відео з панелі;
  - `stats`: анонімна статистика без cookies.
- `vercel.json`: кешування й заголовки безпеки.
- `robots.txt`, `sitemap.xml`: для Google.

## Запуск

1. **GitHub.** Створіть приватний репозиторій `zubi-tattoo`. Натисніть «uploading an existing file», перетягніть увесь вміст цієї папки разом із папками `api`, `img` і `fonts` і натисніть Commit.
2. **Vercel.** Add New → Project → Import → `zubi-tattoo`. Framework Preset: **Other**. Натисніть Deploy.
3. **Сховища.** У проєкті відкрийте Storage:
   - Create → **Upstash for Redis** (план Free) → Connect to project;
   - Create → **Blob** → Connect to project.
4. **Пароль панелі.** Settings → Environment Variables → додайте `ADMIN_PASSWORD` з паролем, який придумаєте самі. Нікому не надсилайте його в чат.
5. **Redeploy.** Deployments → «⋯» біля останнього деплою → Redeploy.
6. **Домен.** Settings → Domains:
   - додайте `zubitattoo.com`;
   - додайте `www.zubitattoo.com` і виберіть Redirect to `zubitattoo.com`.

   Якщо домен куплено у Vercel, записи налаштуються самі. Якщо деінде, Vercel покаже, які DNS-записи вписати в реєстратора.
7. **Перенесення даних.** Відкрийте `https://zubitattoo.com/#panel` і увійдіть. Далі вкладка «Копія даних» → «Перенести дані» → «Замінити». Майстри, роботи, вільні ескізи, тексти, контакти й фото скопіюються зі старого сайту. Старий сайт не видаляйте, поки не перевірите новий.
8. **Статистика.** Вкладка Analytics → Enable (Web Analytics, скрипт уже є на сторінці).

## Захист (Firewall, план Pro)
- Firewall → Bot Protection: увімкнути.
- Firewall → Add Rule → Rate Limit:
  - шлях `/api/admin`: 20 запитів за хвилину з однієї IP → Deny;
  - так само для `/api/upload`.
- Attack Challenge Mode вмикайте тільки під час атаки, одним перемикачем.

## Google
- Search Console → Add property → Domain `zubitattoo.com` → TXT-запис у DNS.
- Sitemaps → `https://zubitattoo.com/sitemap.xml`.
- У Google Business Profile, Instagram і Booksy вкажіть нову адресу сайту.

## Резервна копія
У панелі на вкладці «Копія даних» є кнопка «Завантажити копію». Робіть її час від часу та після великих змін.
