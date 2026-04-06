import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

serve(async (req) => {
  // Обрабатываем GET-запросы (для проверки работоспособности)
  if (req.method === "GET") {
    return new Response("Webhook is running", { status: 200 });
  }

  // Проверяем Content-Type
  const contentType = req.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return new Response("Expected JSON", { status: 400 });
  }

  // Безопасно парсим JSON
  let update;
  try {
    update = await req.json();
  } catch (error) {
    console.error("Ошибка парсинга JSON:", error);
    return new Response("Invalid JSON", { status: 400 });
  }

  const { message } = update;

  // Проверяем наличие сообщения
  if (!message?.text) {
    return new Response("OK", { status: 200 });
  }

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
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: `🤖 Вы написали: ${message.text}`,
      }),
    });
    console.log(`Эхо-ответ отправлен в чат ${message.chat.id}`);
  } catch (error) {
    console.error("Ошибка отправки сообщения в Telegram:", error);
  }

  return new Response("OK", { status: 200 });
});