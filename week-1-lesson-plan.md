supabase# Неделя 1 — Telegram Bot + Админка (readonly)

## Цель недели

К концу недели у студента будет:
- Работающий Telegram-бот в проде, который принимает сообщения
- Supabase-проект с одной таблицей `messages`
- Webhook на Supabase Edge Function, который сохраняет сообщения в БД
- Next.js админка, где видно все сообщения от пользователей

> Принцип недели: **одна таблица, полный вертикальный срез**. Никаких joins, foreign keys, статусов. Студент видит как данные текут от Telegram до UI — и всё работает.

---

## Урок 1 — Знакомство с проектом и настройка окружения

### 1.1 Обзор проекта SupportBot
- Показать финальный результат (демо): бот в Telegram → сообщение появляется в админке
- Разобрать архитектуру на верхнем уровне:
  ```
  User → Telegram → Supabase Edge Function → Supabase DB ← Next.js Admin
  ```
- Объяснить роадмап на 8 недель — что будем делать и зачем
- Показать spec.md и requirements.md — как устроена работа по ТЗ в реальных проектах

### 1.2 Регистрация и настройка Supabase
1. Зарегистрироваться на [supabase.com](https://supabase.com)
2. Создать новый проект (выбрать регион, задать пароль БД)
3. Дождаться инициализации проекта
4. Записать / сохранить ключи из **Settings → API Keys**:
   - `SUPABASE_URL` — URL проекта (Settings → General → Project URL)
   - **Publishable key** (`sb_publishable_...`) — для админки (безопасен для браузера)
   - **Secret key** (`sb_secret_...`) — для Edge Function (серверный, нельзя показывать в браузере)

### 1.3 Создание Telegram-бота
1. Открыть Telegram, найти @BotFather
2. Отправить `/newbot`
3. Задать имя и username бота
4. Получить и сохранить `BOT_TOKEN`
5. Проверить бота — отправить ему сообщение (пока не ответит)

### 1.4 Установка инструментов
1. Убедиться что установлены: Node.js (v18+), npm/pnpm, Git
2. Установить Supabase CLI:
   ```bash
   # macOS
   brew install supabase/tap/supabase

   # Windows (PowerShell)
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase

   # или без установки — работает везде (macOS, Windows, Linux)
   pnpm dlx supabase <command>
   ```
3. Залогиниться в Supabase CLI:
   ```bash
   supabase login
   ```
4. Инициализировать проект:
   ```bash
   supabase init
   ```
5. Связать с удалённым проектом:
   ```bash
   supabase link --project-ref <project-id>
   ```

---

## Урок 2 — Создание базы данных (одна таблица)

### 2.1 Почему одна таблица
- Объяснить: на первой неделе нам нужно только сохранять сообщения и показывать их
- Нет смысла делать `users`, `dialogs` — это лишняя сложность пока
- Вся информация о пользователе (имя, chat_id) хранится прямо в сообщении (денормализация)
- На следующих неделях мы разобьём данные на правильные таблицы — и студенты поймут зачем

### 2.2 Что такое миграции
- Миграция — это SQL-файл, который описывает **одно изменение** в базе данных
- Каждая миграция имеет timestamp в имени файла — Supabase выполняет их строго по порядку
- Миграции — это **история изменений** БД (как git-коммиты, но для базы данных)
- Supabase помнит какие миграции уже применены и не выполняет их повторно
- Правило: **одна миграция = одно логическое изменение**. Создание таблицы — отдельно, настройка безопасности — отдельно

### 2.3 Миграция 1 — создание таблицы `messages`
1. Создать миграцию:
   ```bash
   supabase migration new create_messages_table
   ```
   > Эта команда создаст файл `supabase/migrations/<timestamp>_create_messages_table.sql`

2. Открыть созданный файл и написать SQL:
   ```sql
   CREATE TABLE messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     telegram_chat_id BIGINT NOT NULL,
     username TEXT NOT NULL,
     text TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```

3. Применить миграцию:
   ```bash
   supabase db push
   ```

4. Проверить в Supabase Dashboard → Table Editor → таблица `messages` существует

> На этом этапе таблица создана, но RLS не настроен. Supabase по умолчанию **отключает** RLS для новых таблиц — значит сейчас любой с `anon` ключом может и читать, и писать. Это небезопасно — исправим в следующей миграции.

### 2.4 Row Level Security (RLS) — теория
- Кратко объяснить что такое RLS — механизм безопасности на уровне строк в PostgreSQL
- Когда RLS включен, каждый запрос проверяется по правилам (policies)
- Если включить RLS и **не добавить** политику — доступ заблокирован полностью
- `service_role` ключ **обходит** RLS — поэтому Edge Function сможет писать в любом случае
- Для админки (anon key) нам нужна политика "разрешить чтение всем"
- Это временное решение для первой недели. Полноценная авторизация менеджеров будет позже

### 2.5 Миграция 2 — включаем RLS и добавляем политику
1. Создать **вторую** миграцию:
   ```bash
   supabase migration new add_rls_to_messages
   ```

2. Написать SQL:
   ```sql
   -- Включаем Row Level Security
   ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

   -- Разрешаем читать всем (для админки через anon key)
   -- Edge Function пишет через service_role — RLS на неё не действует
   CREATE POLICY "Allow public read" ON messages
     FOR SELECT USING (true);
   ```

3. Применить миграцию:
   ```bash
   supabase db push
   ```

4. Проверить в Supabase Dashboard → Authentication → Policies:
   - У таблицы `messages` включен RLS
   - Есть политика "Allow public read"

> Теперь в папке `supabase/migrations/` лежат два файла:
> ```
> supabase/migrations/
> ├── 20260317120000_create_messages_table.sql    ← структура
> └── 20260317120100_add_rls_to_messages.sql      ← безопасность
> ```
> Каждый файл — одно изменение с понятным названием. Если другой разработчик склонирует проект и выполнит `supabase db push` — у него будет точно такая же база.

---

## Урок 3 — Что такое Telegram Bot и как он работает

### 3.1 Теория: что такое Telegram Bot
- Бот — это аккаунт в Telegram, которым управляет не человек, а программа
- У бота есть токен (как пароль) — через него мы отправляем и получаем сообщения
- Telegram предоставляет HTTP API для работы с ботом
- Два способа получать сообщения от пользователей:
  - **Polling** — мы сами постоянно спрашиваем Telegram "есть новые сообщения?"
  - **Webhook** — Telegram сам отправляет нам POST-запрос, когда кто-то пишет боту
- Мы будем использовать webhook — это правильный продакшн-подход

### 3.2 Схема работы webhook
```
Пользователь пишет боту в Telegram
  → Telegram отправляет POST запрос на наш URL (webhook)
  → Наша функция получает JSON с данными сообщения
  → Мы обрабатываем и отвечаем пользователю
  → Возвращаем 200 OK (чтобы Telegram знал что мы получили)
```

### 3.3 Telegram Update object
- Показать студентам какой JSON приходит от Telegram:
  ```json
  {
    "update_id": 123456,
    "message": {
      "message_id": 1,
      "from": {
        "id": 987654321,
        "first_name": "Иван",
        "username": "ivan"
      },
      "chat": {
        "id": 987654321,
        "type": "private"
      },
      "date": 1710600000,
      "text": "Привет!"
    }
  }
  ```
- Обратить внимание: `message.from` — кто написал, `message.chat.id` — куда отвечать, `message.text` — что написал

---

## Урок 4 — Ping-pong бот: первый webhook локально

### 4.1 Создание Edge Function
1. Создать функцию:
   ```bash
   supabase functions new telegram-webhook
   ```
2. Открыть файл `supabase/functions/telegram-webhook/index.ts`

### 4.2 Deno vs Node.js: импорты без `npm install`

Прежде чем писать код — важное отличие. Supabase Edge Functions работают на **Deno**, а не на Node.js. Главная разница — как подключаются библиотеки:

**Node.js (привычный подход):**
```bash
npm install express                    # скачивает в node_modules/
```
```typescript
import express from "express";         // берёт из node_modules/
```

**Deno (наш подход):**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
```

В Deno **импорты — это URL-адреса**. Не нужен `npm install`, `package.json`, `node_modules/`. Deno скачивает модуль по URL при первом запуске и кеширует его автоматически.

- Версия указывается прямо в URL: `@0.168.0`
- Нет папки `node_modules/` (сотни мегабайт) — всё кешируется системно
- Нет шага "установи зависимости" — написал импорт и сразу работает

> Студенты из Node.js мира будут удивлены — это нормально. Deno сделан создателем Node.js (Ryan Dahl) как "исправление ошибок" оригинального Node.js.

### 4.3 Код ping-pong бота — эхо-ответ
Самый простой бот: получает сообщение → отправляет его обратно с префиксом.
Никакой БД, никакого Supabase — чистый Telegram API.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

serve(async (req) => {
  // 1. Получаем данные от Telegram
  const { message } = await req.json();

  // Если нет текста — игнорируем (фото, стикер и т.д.)
  if (!message?.text) {
    return new Response("OK", { status: 200 });
  }

  console.log(`Получено сообщение от ${message.from.first_name}: ${message.text}`);

  // 2. Отправляем эхо-ответ обратно пользователю
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: message.chat.id,
      text: `🤖 Вы написали: ${message.text}`,
    }),
  });

  console.log(`Эхо-ответ отправлен в чат ${message.chat.id}`);

  // 3. Возвращаем 200 — Telegram должен знать что мы получили
  return new Response("OK", { status: 200 });
});
```

**Обратить внимание студентов:**
- Никакой БД — просто принимаем сообщение и отправляем ответ
- `sendMessage` — метод Telegram Bot API для отправки сообщений
- `chat_id` — кому отвечаем (берём из входящего сообщения)
- `console.log` — выводит в терминал, где запущен `deno run`. Так мы видим что функция работает
- Всегда возвращаем 200, иначе Telegram будет повторять запросы

### 4.4 Установка Deno (для локального запуска)

Чтобы запустить этот код локально, нужен Deno на машине:
```bash
# macOS
brew install deno

# Windows
scoop install deno

# Linux
curl -fsSL https://deno.land/install.sh | sh
```

Проверить:
```bash
deno --version
```

### 4.5 Запуск webhook локально
1. Создать файл `.env.local` в корне проекта (рядом с `supabase/`):
   ```
   BOT_TOKEN=<your-bot-token>
   ```
2. Запустить Edge Function локально через Deno:
   ```bash
   deno run --allow-all --env-file=.env.local supabase/functions/telegram-webhook/index.ts
   ```
   > Функция запустится на `http://localhost:8000`

   > **Почему `deno run`, а не `supabase functions serve`?**
   > `supabase functions serve` требует Docker и `supabase start` — это тяжёлая зависимость.
   > Для первой недели нам достаточно `deno run` — быстрее и проще.

3. Проверить что работает — отправить тестовый запрос вручную:
   ```bash
   curl -X POST http://localhost:8000 \
     -H "Content-Type: application/json" \
     -d '{"message":{"from":{"id":1,"first_name":"Test"},"chat":{"id":1},"text":"Hello"}}'
   ```
   > В терминале должен быть лог. Ответ в Telegram не придёт (chat_id тестовый), но функция отработает без ошибок.

### 4.6 Туннель: открываем локальный сервер в интернет

Telegram должен отправлять запросы на наш URL. Но `localhost` не доступен из интернета. Нужен туннель — программа, которая даёт публичный URL и перенаправляет трафик на наш localhost.

**Устанавливаем Cloudflare Tunnel (cloudflared):**
```bash
# macOS
brew install cloudflared

# Windows (PowerShell)
scoop install cloudflared
# или
choco install cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

> Почему cloudflared, а не ngrok? Cloudflared полностью бесплатный, без регистрации, без лимитов на количество подключений и время работы.

**Запускаем туннель (в отдельном терминале):**
```bash
cloudflared tunnel --url http://localhost:8000
```

Cloudflared выдаст публичный URL вида:
```
https://random-words-here.trycloudflare.com
```

> Теперь у студента открыты **два терминала**:
> 1. `deno run ...` — Edge Function работает на порту 8000
> 2. `cloudflared tunnel ...` — туннель перенаправляет трафик из интернета на порт 8000

### 4.7 Подключаем webhook к Telegram (локальная разработка)
1. Установить webhook на локальный туннель (в **третьем** терминале):
   ```bash
   curl -X POST "https://api.telegram.org/bot8410206644:AAE9rblIfHrG58Mo1p9nUGnI6dOwaFvq_3s/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://carrying-brooks-expansys-uniform.trycloudflare.com"}'
   ```
   > URL без `/functions/v1/...` — Deno слушает на корне, не под path-ом
2. Проверить:
   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
   ```

### 4.8 Тестирование ping-pong
1. Написать боту в Telegram любое сообщение
2. Бот должен ответить: `🤖 Вы написали: <ваше сообщение>`
3. В терминале (где запущена Edge Function) видно логи — запрос пришёл, обработан
4. Попробовать отправить разные сообщения — бот эхо-отвечает на каждое

> **Момент успеха:** студент видит что его код работает, бот отвечает в реальном времени. Это мотивирует перед следующим шагом.

---

## Урок 5 — Подключаем Supabase: сохраняем сообщения в БД

### 5.1 Зачем нужна БД
- Ping-pong бот работает, но ничего не запоминает
- Если перезапустить сервер — все сообщения пропали
- Нам нужно сохранять сообщения, чтобы менеджеры видели их в админке
- Добавляем Supabase — всего один import и один insert

### 5.2 Обновляем код webhook — добавляем сохранение в БД
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN")!;

serve(async (req) => {
  const { message } = await req.json();
  if (!message?.text) return new Response("OK", { status: 200 });

  console.log(`Получено сообщение от ${message.from.first_name}: ${message.text}`);

  // 1. Создаём клиент Supabase
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 2. Сохраняем сообщение в БД
  const { error } = await supabase.from("messages").insert({
    telegram_chat_id: message.chat.id,
    username: message.from.first_name || "Unknown",
    text: message.text,
  });

  if (error) {
    console.error("Ошибка записи в БД:", error.message);
  } else {
    console.log("Сообщение сохранено в БД");
  }

  // 3. Отправляем эхо-ответ пользователю
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: message.chat.id,
      text: `🤖 Вы написали: ${message.text}`,
    }),
  });

  console.log(`Эхо-ответ отправлен в чат ${message.chat.id}`);

  return new Response("OK", { status: 200 });
});
```

**Что изменилось:**
- Добавили import `createClient`
- Добавили создание Supabase клиента (2 строки)
- Добавили `insert` в таблицу `messages` (1 вызов)
- Добавили `console.log` — в терминале видно каждый шаг: получение, сохранение, отправка
- Добавили проверку `error` — если запись в БД не удалась, сразу видно в терминале
- Эхо-ответ оставили — бот по-прежнему отвечает пользователю

### 5.3 Тестируем локально с БД
1. Обновить `.env.local` — добавить Supabase ключи:
   ```
   BOT_TOKEN=<your-bot-token>
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<your sb_secret_... key>
   ```
2. Перезапустить Edge Function (остановить предыдущий `deno run` через Ctrl+C):
   ```bash
   deno run --allow-all --env-file=.env.local supabase/functions/telegram-webhook/index.ts
   ```
3. Написать боту в Telegram
4. Проверить: бот ответил И сообщение появилось в Supabase Dashboard → Table Editor → messages

### 5.4 Деплой в Supabase (прод)
1. Задать секреты для прода:
   ```bash
   supabase secrets set BOT_TOKEN=<your-bot-token>
   ```
   > `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` уже доступны в Edge Functions автоматически

2. Задеплоить функцию (выполнять из корня проекта, где лежит папка `supabase/`):
   ```bash
   supabase functions deploy telegram-webhook --no-verify-jwt
   ```
   > `--no-verify-jwt` — потому что Telegram не отправляет JWT токен

   > **Возможная ошибка: `Unsupported lockfile version`**
   > Если при деплое появляется ошибка про `deno.lock` — удалите lockfile и повторите:
   > ```bash
   > rm supabase/functions/telegram-webhook/deno.lock
   > supabase functions deploy telegram-webhook --no-verify-jwt
   > ```
   > Это происходит потому что локальный Deno новее, чем Deno в Supabase. Lockfile будет пересоздан при деплое.

3. Переключить webhook на продакшн URL:
   ```bash
   curl -X POST "https://api.telegram.org/bot8410206644:AAE9rblIfHrG58Mo1p9nUGnI6dOwaFvq_3s/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://yhkngsbyrmbwjthndxrr.supabase.co/functions/v1/telegram-webhook"}'
   ```

4. Проверить:
   ```bash
   curl "https://api.telegram.org/bot8410206644:AAE9rblIfHrG58Mo1p9nUGnI6dOwaFvq_3s/getWebhookInfo"
   ```

### 5.5 Финальное тестирование webhook
1. Отправить сообщение боту в Telegram
2. Бот отвечает эхо-сообщением
3. Открыть Supabase Dashboard → Table Editor → messages
4. Убедиться что сообщение сохранилось с правильными данными
5. Отправить ещё несколько сообщений — все появляются в таблице
6. Попросить другого студента написать боту — его сообщения тоже сохраняются

---

## Урок 6 — Next.js Админка: настройка проекта

### 6.1 Создание Next.js проекта
1. Создать проект:
   ```bash
   pnpm create next-app support-admin --typescript --tailwind --app --src-dir --eslint --yes
   ```
2. Установить Supabase клиент:
   ```bash
   cd support-admin
   pnpm add @supabase/supabase-js
   ```
3. Создать `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your sb_publishable_... key>
   ```

### 6.2 Создать Supabase клиент
Создать файл `src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### 6.3 Объяснить структуру проекта
- Кратко про App Router в Next.js
- Структура на первую неделю — максимально простая:
  ```
  src/
  ├── app/
  │   ├── page.tsx          — единственная страница: список сообщений
  │   └── layout.tsx
  └── lib/
      └── supabase.ts
  ```
- Никаких лишних страниц, роутинга, компонентов — одна страница, один запрос

---

## Урок 7 — Админка: отображение сообщений

### 7.1 Страница со списком сообщений (`page.tsx`)
1. Загрузить сообщения из Supabase:
   ```typescript
   const { data: messages } = await supabase
     .from("messages")
     .select("*")
     .order("created_at", { ascending: false });
   ```
2. Отобразить список — для каждого сообщения показать:
   - Имя пользователя (`username`)
   - Текст сообщения (`text`)
   - Время отправки (`created_at`)
   - Telegram Chat ID (`telegram_chat_id`)

### 7.2 Базовая стилизация (Tailwind)
- Карточка сообщения с рамкой / фоном
- Имя пользователя жирным
- Время — серым, мелким шрифтом
- Отступы между карточками
- Заголовок страницы "SupportBot — Сообщения"

### 7.3 Запуск и проверка
1. Запустить dev сервер:
   ```bash
   pnpm dev
   ```
2. Открыть http://localhost:3000
3. Убедиться что сообщения отображаются
4. Отправить новое сообщение боту → обновить страницу → сообщение появилось

---

## Урок 8 — Деплой и финальное тестирование

### 8.1 Деплой на Vercel
1. Создать репозиторий на GitHub:
   ```bash
   git init
   git add .
   git commit -m "Week 1: messages list"
   ```
2. Запушить на GitHub
3. Задеплоить на Vercel:
   ```bash
   pnpm dlx vercel
   ```
4. Добавить environment variables в Vercel Dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL` — URL проекта
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Publishable key (`sb_publishable_...`)

### 8.2 Финальное тестирование (end-to-end)
1. Отправить сообщение боту в Telegram
2. Открыть админку (Vercel URL)
3. Обновить страницу — сообщение появилось
4. Отправить ещё сообщения — все видны
5. Попросить другого человека написать боту — его сообщения тоже видны

### 8.3 Обсуждение: что не так с текущей архитектурой?
Подвести студентов к проблемам, которые будем решать на следующих неделях:
- **Нет разделения по диалогам** — все сообщения в одной куче, непонятно какие от одного клиента
- **Нет статусов** — не знаем какие обращения обработаны, какие нет
- **Нет менеджеров** — некому назначить обращение
- **Нужно обновлять страницу** — нет realtime
- **Бот не отвечает** — только принимает сообщения

> Это подводка к неделе 2, где мы добавим `users`, `dialogs`, статусы и ответы менеджеров.

---

## Домашнее задание

1. **Обязательное:**
   - Добавить обработку команды `/start` в webhook — бот должен отвечать приветственным сообщением через Telegram Bot API (`sendMessage`). Подсказка:
     ```typescript
     await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         chat_id: message.chat.id,
         text: "Здравствуйте! Опишите вашу проблему, и мы поможем.",
       }),
     });
     ```
   - Не сохранять `/start` как обычное сообщение в БД

2. **Дополнительное:**
   - Группировка сообщений по `telegram_chat_id` в админке (показать сообщения одного пользователя вместе)
   - Добавить счётчик: сколько всего сообщений и сколько уникальных пользователей

---

## Чек-лист результата недели

- [ ] Бот создан через BotFather и работает
- [ ] Supabase проект создан, таблица `messages` существует
- [ ] Edge Function задеплоена и подключена как webhook
- [ ] Сообщения из Telegram сохраняются в БД
- [ ] Next.js админка показывает список всех сообщений
- [ ] Админка задеплоена на Vercel
- [ ] Бот отвечает на `/start` (домашнее задание)
