import { supabase } from "@/lib/supabase";

// Тип для сообщения
interface Message {
  id: number;
  telegram_chat_id: number;
  username: string;
  text: string;
  created_at: string;
}

export default async function Home() {
  // Загружаем сообщения из Supabase
  const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false });

  if (error) {
    console.error("Ошибка загрузки сообщений:", error);
    return (
        <div className="p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Ошибка загрузки сообщений
          </h1>
          <p className="text-gray-600">{error.message}</p>
        </div>
    );
  }

  return (
      <div className="container mx-auto p-8">
        <h1 className="text-3xl font-bold mb-8">
          Сообщения из Telegram бота
        </h1>

        {messages && messages.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Пока нет сообщений. Напишите что-нибудь боту в Telegram!
            </p>
        ) : (
            <div className="space-y-4">
              {messages?.map((message: Message) => (
                  <div
                      key={message.id}
                      className="border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                  <span className="font-semibold text-lg">
                    {message.username}
                  </span>
                        <span className="text-sm text-gray-500 ml-2">
                    Chat ID: {message.telegram_chat_id}
                  </span>
                      </div>
                      <span className="text-sm text-gray-500">
                  {new Date(message.created_at).toLocaleString('ru-RU')}
                </span>
                    </div>
                    <p className="text-gray-700">{message.text}</p>
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}