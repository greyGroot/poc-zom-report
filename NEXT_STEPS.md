# 🚀 Покроковий план дій для запуску (NEXT_STEPS.md)

Цей чекліст містить чіткі кроки, які необхідно виконати для запуску та виходу в продакшн.

---

### Крок 1. Змінні оточення на Vercel (ВЖЕ НАЛАШТОВАНО ✅)

Усі необхідні змінні вже підключені у вашому Vercel Dashboard:
- ✅ `KV_REST_API_URL` та `KV_REST_API_TOKEN` (підключено автоматично через Vercel Storage KV / Upstash).
- ✅ `ZOOM_WEBHOOK_SECRET_TOKEN` (налаштовано).
- ✅ `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` (налаштовано).

Бекенд у `api/lib/redis.js` нативно використовує `KV_REST_API_URL` та `KV_REST_API_TOKEN` — додатково нічого прописувати вручну на Vercel не потрібно!

---

### Крок 2. Зберегти зміни в Git та задеплоїти на Vercel

У кореневій директорії проєкту виконайте команди:

```bash
# 1. Додати всі оновлені та нові файли
git add .

# 2. Зробити коміт
git commit -m "feat: complete zoom webhooks telemetry with upstash redis and dual-tab ui"

# 3. Відправити у репозиторій (тригер автоматичного деплою на Vercel)
git push origin main
```

Зачекайте 15–30 секунд, поки Vercel завершить збірку та деплой вашого проєкту. Переконайтеся, що деплой має зелений статус **Ready**.

---

### Крок 3. Налаштувати Event Subscriptions у Zoom Marketplace

1. Відкрийте [Zoom App Marketplace](https://marketplace.zoom.us/).
2. Перейдіть у **Manage** -> виберіть ваше **Server-to-Server OAuth** додаток.
3. Перейдіть на вкладку **Feature** (зліва) -> увімкніть перемикач **Event Subscriptions** (якщо вимкнено) -> натисніть **Add Event Subscription** (або відредагуйте існуючу).
4. Заповніть параметри:
   - **Subscription Name:** наприклад, `Zoom Attendance Ingestion`.
   - **Event notification endpoint URL:**
     ```text
     https://<ваш-домен-vercel>.vercel.app/api/webhooks/zoom
     ```
   - Натисніть кнопку **Validate** праворуч від URL.
     - *Має з'явитися зелена позначка: **"Validated"**.*
5. У розділі **Event types** натисніть **Add Events** і відзначте 4 події:
   - Вкладка **Meeting**:
     - ✅ **Start Meeting** (`meeting.started`)
     - ✅ **End Meeting** (`meeting.ended`)
     - ✅ **Participant/Host joined meeting** (`meeting.participant_joined`)
     - ✅ **Participant/Host left meeting** (`meeting.participant_left`)
6. Натисніть **Done**, а потім обов'язково натисніть **Save** внизу сторінки.

---

### Крок 4. Перевірити дозволи (Scopes) в Zoom App

Перейдіть на вкладку **Scopes** вашого додатку в Zoom Marketplace і переконайтеся, що додано:
- `meeting:read:admin`
- `report:read:meeting:admin`
- `dashboard:read:list_meeting_participants_qos:admin`

*(Якщо додаток змінював Scopes, не забудьте знову активувати його на вкладці **Activation**).*

---

### Крок 5. Провести перевірку за інструкцією тестування

Після виконання кроків 1–4 перейдіть до файлу [TESTING_GUIDE.md](TESTING_GUIDE.md) та проведіть тестовий урок під акаунтом `gray.rsm@gmail.com`.
