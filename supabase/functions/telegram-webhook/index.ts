import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import type { Database } from "../_shared/database.types.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

function normalizeOptional(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

serve(async (req) => {
  if (req.method === "GET") {
    return new Response("Webhook is running", { status: 200 });
  }

  const contentType = req.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return new Response("Expected JSON", { status: 400 });
  }

  let update;
  try {
    update = await req.json();
  } catch (error) {
    console.error("Ошибка парсинга JSON:", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  const { message } = update;

  if (!message?.text) {
    return new Response("OK", { status: 200 });
  }

  const messageText = message.text.trim();
  const chatId = message.chat.id;
  const firstName = normalizeOptional(message.from.first_name, 64);
  const lastName = normalizeOptional(message.from.last_name, 64);
  const username = normalizeOptional(message.from.username, 32);
  const displayName = firstName ?? username ?? "Unknown";

  console.log(`Получено сообщение от ${displayName}: ${messageText}`);

  const supabase = createClient<Database>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .upsert(
      {
        telegram_chat_id: chatId,
        first_name: firstName,
        last_name: lastName,
        username,
      },
      { onConflict: "telegram_chat_id" },
    )
    .select("id")
    .single();

  if (clientError) {
    console.error("Ошибка upsert клиента:", clientError.message);
    return new Response("DB client error", { status: 500 });
  }

  if (messageText === "/start") {
    console.log(`Приветствие нового пользователя ${displayName} (Chat ID: ${chatId})`);

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
          "👋 Здравствуйте! Опишите вашу проблему, и мы поможем.\n\n" +
          "💡 *Примеры запросов:*\n" +
          "- У меня проблема с оплатой\n" +
          "- Как восстановить пароль?\n" +
          "- Не работает приложение",
        parse_mode: "Markdown",
      }),
    });

    console.log(`Приветствие отправлено пользователю ${displayName}`);
    return new Response("OK", { status: 200 });
  }

  const messageRow: Database["public"]["Tables"]["messages"]["Insert"] = {
    client_id: client.id,
    telegram_chat_id: chatId,
    first_name: firstName,
    last_name: lastName,
    username,
    text: messageText,
  };

  const { error } = await supabase.from("messages").insert(messageRow);

  if (error) {
    console.error("Ошибка записи в БД:", error.message);
  } else {
    console.log("Сообщение сохранено в БД");
  }

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ Ваше сообщение получено. Мы ответим вам в ближайшее время.\n\n📝 Вы написали: ${messageText}`,
      }),
    });
    console.log(`Подтверждение отправлено в чат ${chatId}`);
  } catch (error) {
    console.error("Ошибка отправки сообщения в Telegram:", error);
  }

  return new Response("OK", { status: 200 });
});
