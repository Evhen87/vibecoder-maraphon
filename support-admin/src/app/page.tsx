"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface Manager {
  user_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  position: string;
  created_at: string;
}

interface Client {
  id: string;
  telegram_chat_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  created_at: string;
}

interface ClientAssignment {
  client_id: string;
  assigned_manager_user_id: string | null;
  assignment_updated_by_manager_user_id: string | null;
  assignment_updated_at: string | null;
}

interface Message {
  id: string;
  client_id: string;
  telegram_chat_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  text: string;
  created_at: string;
}

interface Conversation {
  client: Client;
  messages: Message[];
  lastMessageAt: string;
  messageCount: number;
}

function getClientDisplayName(client: Client) {
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ").trim();

  if (fullName) {
    return fullName;
  }

  if (client.username?.trim()) {
    return `@${client.username.trim()}`;
  }

  return `Chat ${client.telegram_chat_id}`;
}

function getManagerLabel(manager: Manager | null | undefined) {
  if (!manager) {
    return "Не назначен";
  }

  const displayName = getManagerDisplayName(manager);

  return `${displayName} · ${manager.position}`;
}

function getManagerDisplayName(manager: Manager | null | undefined) {
  if (!manager) {
    return "Не назначен";
  }

  const fullName = [manager.first_name, manager.last_name].filter(Boolean).join(" ").trim();
  return fullName || manager.name;
}

function buildConversations(clients: Client[], messages: Message[]) {
  const messagesByClient = new Map<string, Message[]>();

  for (const message of messages) {
    const bucket = messagesByClient.get(message.client_id) ?? [];
    bucket.push(message);
    messagesByClient.set(message.client_id, bucket);
  }

  const conversations: Conversation[] = clients.map((client) => {
    const clientMessages = (messagesByClient.get(client.id) ?? []).sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    );

    return {
      client,
      messages: clientMessages,
      lastMessageAt: clientMessages[0]?.created_at ?? client.created_at,
      messageCount: clientMessages.length,
    };
  });

  conversations.sort(
    (left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime(),
  );

  return {
    conversations,
    totalMessages: messages.length,
    totalClients: clients.length,
  };
}

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientAssignments, setClientAssignments] = useState<ClientAssignment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedManagerUserId, setSelectedManagerUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [assignmentClientId, setAssignmentClientId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let realtimeChannel: RealtimeChannel | null = null;

    const loadData = async () => {
      const [
        { data: managersData, error: managersError },
        { data: clientsData, error: clientsError },
        { data: assignmentsData, error: assignmentsError },
        { data: messagesData, error: messagesError },
      ] = await Promise.all([
        supabase.from("managers").select("*").order("first_name", { ascending: true }),
        supabase.from("clients").select("*").order("created_at", { ascending: false }),
        supabase
          .from("client_assignments")
          .select("*")
          .order("assignment_updated_at", { ascending: false, nullsFirst: false }),
        supabase.from("messages").select("*").order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      if (managersError) {
        setErrorMessage(managersError.message);
        setLoading(false);
        return;
      }

      if (clientsError) {
        setErrorMessage(clientsError.message);
        setLoading(false);
        return;
      }

      if (assignmentsError) {
        setErrorMessage(assignmentsError.message);
        setLoading(false);
        return;
      }

      if (messagesError) {
        setErrorMessage(messagesError.message);
        setLoading(false);
        return;
      }

      const nextManagers = (managersData as Manager[]) ?? [];
      const nextClients = (clientsData as Client[]) ?? [];
      const nextAssignments = (assignmentsData as ClientAssignment[]) ?? [];
      const nextMessages = (messagesData as Message[]) ?? [];

      setManagers(nextManagers);
      setClients(nextClients);
      setClientAssignments(nextAssignments);
      setMessages(nextMessages);
      setSelectedClientId((currentValue) => {
        if (currentValue && nextClients.some((client) => client.id === currentValue)) {
          return currentValue;
        }

        return nextClients[0]?.id ?? null;
      });
      setSelectedManagerUserId((currentValue) => {
        if (currentValue && nextManagers.some((manager) => manager.user_id === currentValue)) {
          return currentValue;
        }

        const firstAssignment = nextAssignments.find(
          (assignment) => assignment.client_id === nextClients[0]?.id,
        );

        return firstAssignment?.assigned_manager_user_id ?? "";
      });
      setLoading(false);
    };

    const bootstrap = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (!currentSession) {
        router.replace("/login");
        return;
      }

      setSession(currentSession);
      await loadData();

      realtimeChannel = supabase
        .channel("support-admin-dialogs")
        .on("postgres_changes", { event: "*", schema: "public", table: "managers" }, () => {
          void loadData();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
          void loadData();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "client_assignments" }, () => {
          void loadData();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
          void loadData();
        })
        .subscribe();
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        router.replace("/login");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();

      if (realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, [router]);

  const stats = useMemo(() => buildConversations(clients, messages), [clients, messages]);
  const managersByUserId = useMemo(
    () => new Map(managers.map((manager) => [manager.user_id, manager])),
    [managers],
  );
  const assignmentsByClientId = useMemo(
    () => new Map(clientAssignments.map((assignment) => [assignment.client_id, assignment])),
    [clientAssignments],
  );
  const currentManager = session ? managersByUserId.get(session.user.id) ?? null : null;
  const selectedConversation =
    stats.conversations.find((conversation) => conversation.client.id === selectedClientId) ?? null;
  const selectedAssignment = selectedConversation
    ? assignmentsByClientId.get(selectedConversation.client.id) ?? null
    : null;
  const assignedManager = selectedAssignment?.assigned_manager_user_id
    ? managersByUserId.get(selectedAssignment.assigned_manager_user_id) ?? null
    : null;
  const assignmentUpdatedBy = selectedAssignment?.assignment_updated_by_manager_user_id
    ? managersByUserId.get(selectedAssignment.assignment_updated_by_manager_user_id) ?? null
    : null;

  const handleLogout = async () => {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      setIsSigningOut(false);
      return;
    }

    router.replace("/login");
  };

  const updateClientAssignment = async (clientId: string, managerUserId: string | null) => {
    if (!session) {
      return;
    }

    setAssignmentClientId(clientId);
    setErrorMessage(null);

    const { error } = await supabase
      .from("client_assignments")
      .upsert({
        client_id: clientId,
        assigned_manager_user_id: managerUserId,
        assignment_updated_by_manager_user_id: session.user.id,
        assignment_updated_at: new Date().toISOString(),
      });

    if (error) {
      setErrorMessage(error.message);
    }

    setAssignmentClientId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dbeafe,transparent_35%),linear-gradient(135deg,#f8fafc,#dbeafe_55%,#eff6ff)] p-6">
        <div className="rounded-3xl border border-white/70 bg-white/80 px-8 py-6 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-full bg-blue-100" />
          <p className="text-sm font-medium text-slate-600">Проверяем доступ к админке...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-100 p-8">
        <div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl">
          <div className="mb-4 text-5xl">Ошибка</div>
          <h1 className="mb-3 text-2xl font-bold text-red-600">Ошибка доступа к сообщениям</h1>
          <p className="mb-6 text-sm text-slate-600">{errorMessage}</p>
          <div className="flex justify-center gap-3">
            <button
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
              onClick={() => window.location.reload()}
              type="button"
            >
              Обновить
            </button>
            <button
              className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700"
              onClick={handleLogout}
              type="button"
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#bfdbfe,transparent_26%),radial-gradient(circle_at_top_right,#ddd6fe,transparent_24%),linear-gradient(180deg,#f8fafc,#eef4ff_55%,#f8fafc)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-white">
                SUPPORT ADMIN
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Панель диалогов SupportBot
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Список клиентов и их диалогов из Telegram. Вход выполнен как{" "}
                <span className="font-semibold text-slate-900">
                  {session.user.email ?? "администратор"}
                </span>
                .
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
                Текущий менеджер: <span className="font-semibold text-slate-900">{getManagerLabel(currentManager)}</span>
              </div>
              <Link
                className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                href="/reset-password"
              >
                Сменить пароль
              </Link>
              <button
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSigningOut}
                onClick={handleLogout}
                type="button"
              >
                {isSigningOut ? "Выходим..." : "Выйти"}
              </button>
            </div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[1.75rem] border border-blue-100 bg-white p-6 shadow-lg shadow-blue-100/50">
            <p className="text-sm font-medium text-slate-500">Всего сообщений</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-4xl font-bold text-slate-900">{stats.totalMessages}</p>
              <span className="text-4xl">💬</span>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-emerald-100 bg-white p-6 shadow-lg shadow-emerald-100/50">
            <p className="text-sm font-medium text-slate-500">Активных диалогов</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-4xl font-bold text-slate-900">{stats.totalClients}</p>
              <span className="text-4xl">👥</span>
            </div>
          </div>
        </section>

        {stats.totalClients === 0 ? (
          <section className="rounded-[2rem] border border-white/80 bg-white/80 p-12 text-center shadow-xl backdrop-blur">
            <div className="mb-5 text-7xl">📭</div>
            <h2 className="mb-3 text-2xl font-semibold text-slate-900">Пока нет диалогов</h2>
            <p className="mx-auto max-w-xl text-slate-500">
              Как только клиент напишет боту в Telegram, он появится в списке диалогов.
            </p>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[360px,minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 shadow-lg backdrop-blur">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Клиенты</h2>
                <p className="mt-1 text-sm text-slate-500">Список чатов из таблицы `clients`.</p>
              </div>

              <div className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
                {stats.conversations.map((conversation) => {
                  const { client, messages: clientMessages, lastMessageAt, messageCount } = conversation;
                  const isActive = client.id === selectedClientId;
                  const displayName = getClientDisplayName(client);
                  const previewText = clientMessages[0]?.text?.trim() || "Новый диалог без сообщений";
                  const listAssignment = assignmentsByClientId.get(client.id) ?? null;
                  const listAssignedManager = listAssignment?.assigned_manager_user_id
                    ? managersByUserId.get(listAssignment.assigned_manager_user_id) ?? null
                    : null;

                  return (
                    <button
                      key={client.id}
                      className={`flex w-full items-start gap-3 px-5 py-4 text-left transition ${
                        isActive ? "bg-slate-900 text-white" : "bg-transparent text-slate-900 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setSelectedManagerUserId(listAssignment?.assigned_manager_user_id ?? "");
                      }}
                      type="button"
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          isActive ? "bg-white/15 text-white" : "bg-slate-900 text-white"
                        }`}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{displayName}</p>
                            <p className={`truncate text-xs ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                              Chat ID: {client.telegram_chat_id}
                            </p>
                          </div>
                          <p className={`shrink-0 text-xs ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                            {new Date(lastMessageAt).toLocaleDateString("ru-RU")}
                          </p>
                        </div>
                        <p className={`mt-2 text-sm ${isActive ? "text-slate-200" : "text-slate-600"}`}>
                          {previewText}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <p className={`text-xs ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                            {messageCount} сообщений
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              isActive
                                ? "bg-white/15 text-white"
                                : listAssignedManager
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {listAssignedManager ? getManagerDisplayName(listAssignedManager) : "Не назначен"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 shadow-lg backdrop-blur">
              {selectedConversation ? (
                <>
                  <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50 p-5">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                          {getClientDisplayName(selectedConversation.client).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold text-slate-900">
                            {getClientDisplayName(selectedConversation.client)}
                          </h2>
                          <p className="text-sm text-slate-500">
                            Chat ID: {selectedConversation.client.telegram_chat_id}
                          </p>
                        </div>
                      </div>

                      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                              Назначение менеджера
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              Текущий: <span className="font-semibold text-slate-900">{getManagerLabel(assignedManager)}</span>
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              assignedManager ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {assignedManager ? "Назначен" : "Свободен"}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                          <select
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                            onChange={(event) => setSelectedManagerUserId(event.target.value)}
                            value={selectedManagerUserId}
                          >
                            <option value="">Выберите менеджера</option>
                            {managers.map((manager) => (
                              <option key={manager.user_id} value={manager.user_id}>
                                {getManagerLabel(manager)}
                              </option>
                            ))}
                          </select>
                          <button
                            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!selectedManagerUserId || assignmentClientId === selectedConversation.client.id}
                            onClick={() => void updateClientAssignment(selectedConversation.client.id, selectedManagerUserId)}
                            type="button"
                          >
                            Назначить
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!currentManager || assignmentClientId === selectedConversation.client.id}
                            onClick={() =>
                              currentManager
                                ? void updateClientAssignment(selectedConversation.client.id, currentManager.user_id)
                                : undefined
                            }
                            type="button"
                          >
                            Назначить на меня
                          </button>
                          <button
                            className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!selectedAssignment?.assigned_manager_user_id || assignmentClientId === selectedConversation.client.id}
                            onClick={() => void updateClientAssignment(selectedConversation.client.id, null)}
                            type="button"
                          >
                            Снять назначение
                          </button>
                        </div>

                        {selectedAssignment?.assignment_updated_at ? (
                          <p className="mt-3 text-xs text-slate-500">
                            Последнее изменение: {new Date(selectedAssignment.assignment_updated_at).toLocaleString("ru-RU")}
                            {assignmentUpdatedBy ? ` · ${getManagerDisplayName(assignmentUpdatedBy)}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[70vh] space-y-4 overflow-y-auto bg-[linear-gradient(180deg,#f8fbff,#ffffff)] p-5">
                    {selectedConversation.messages.map((message) => (
                      <article
                        key={message.id}
                        className="max-w-3xl rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                      >
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                          {new Date(message.created_at).toLocaleString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.text}</p>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center p-8 text-center text-slate-500">
                  Выберите клиента слева, чтобы открыть диалог.
                </div>
              )}
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-slate-200/80 pt-6 text-center text-sm text-slate-400">
          © 2026 SupportBot Admin
        </footer>
      </div>
    </div>
  );
}
