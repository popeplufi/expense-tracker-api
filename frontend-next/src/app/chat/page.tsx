"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import {
  listChats,
  listMessages,
  login,
  postMessage,
  refresh,
  type ChatEnvelope,
  type ChatSummary,
} from "@/lib/api/gateway";
import { clearSession, loadSession, saveSession, type SessionState } from "@/lib/auth/session";
import { connectGatewaySocket } from "@/lib/realtime/socket";

type UiMessage = {
  id: string;
  chatId: number;
  senderId: number;
  text: string;
  sentAt: string;
  pending?: boolean;
  failed?: boolean;
  queued?: boolean;
  receipt?: "sent" | "delivered" | "seen";
};

type PendingOutbound = {
  chatId: number;
  payload: {
    clientMessageId: string;
    nonce: string;
    ciphertext: string;
    sentAt: string;
    metadata?: Record<string, unknown>;
  };
};

const OUTBOX_KEY = "gateway_outbox_v1";

function nonce(): string {
  return `${crypto.randomUUID()}-${Date.now()}`;
}

function encryptForDemo(plain: string): string {
  return btoa(unescape(encodeURIComponent(plain)));
}

function decryptForDemo(ciphertext: string): string {
  try {
    return decodeURIComponent(escape(atob(ciphertext)));
  } catch {
    return "[Encrypted message]";
  }
}

function mapEnvelopeToUi(envelope: ChatEnvelope): UiMessage {
  return {
    id: String(envelope.id),
    chatId: Number(envelope.chat_id),
    senderId: Number(envelope.sender_user_id),
    text: decryptForDemo(envelope.ciphertext),
    sentAt: envelope.created_at,
  };
}

function loadOutbox(): PendingOutbound[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingOutbound[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOutbox(items: PendingOutbound[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export default function ChatPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin12345");

  const [loadingAuth, setLoadingAuth] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [composer, setComposer] = useState("");

  const [socketState, setSocketState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [networkOnline, setNetworkOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [typingText, setTypingText] = useState("");
  const [error, setError] = useState("");

  const [outbox, setOutbox] = useState<PendingOutbound[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const currentUserId = session?.user.id ?? 0;

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => Number(b.chat_id) - Number(a.chat_id)),
    [chats],
  );

  useEffect(() => {
    setOutbox(loadOutbox());
  }, []);

  useEffect(() => {
    saveOutbox(outbox);
  }, [outbox]);

  useEffect(() => {
    const online = () => setNetworkOnline(true);
    const offline = () => setNetworkOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  async function loadWorkspace(current: SessionState) {
    setLoadingChats(true);
    try {
      const chatItems = await listChats(current);
      setChats(chatItems);
      const first = chatItems[0]?.chat_id ?? null;
      setActiveChatId(first);
      if (first) {
        setLoadingMessages(true);
        try {
          const items = await listMessages(current, first, 80);
          setMessages(items.reverse().map(mapEnvelopeToUi));
        } finally {
          setLoadingMessages(false);
        }
      } else {
        setMessages([]);
      }
    } finally {
      setLoadingChats(false);
    }
  }

  async function restoreOrRefresh() {
    const current = loadSession();
    if (!current) return;

    setSession(current);
    try {
      await loadWorkspace(current);
    } catch {
      try {
        const rotated = await refresh(current.refreshToken);
        const next: SessionState = {
          accessToken: rotated.accessToken,
          refreshToken: rotated.refreshToken,
          user: rotated.user,
        };
        saveSession(next);
        setSession(next);
        await loadWorkspace(next);
      } catch {
        clearSession();
        setSession(null);
      }
    }
  }

  useEffect(() => {
    restoreOrRefresh().catch(() => setSession(null));
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  async function flushOutbox(current: SessionState, socket: Socket | null) {
    if (!outbox.length || !networkOnline) return;
    const remaining: PendingOutbound[] = [];

    for (const item of outbox) {
      try {
        await postMessage(current, item.chatId, item.payload);
        socket?.emit("chat:send", { chatId: item.chatId, ...item.payload });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === item.payload.clientMessageId
              ? { ...m, pending: false, queued: false, failed: false }
              : m,
          ),
        );
      } catch {
        remaining.push(item);
      }
    }

    setOutbox(remaining);
  }

  useEffect(() => {
    if (!session) return;

    setSocketState("connecting");
    socketRef.current?.disconnect();
    const socket = connectGatewaySocket(session.accessToken);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketState("connected");
      if (activeChatId) socket.emit("chat:join", { chatId: activeChatId });
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = window.setInterval(() => {
        socket.emit("presence:heartbeat");
      }, 8000);
      flushOutbox(session, socket).catch(() => undefined);
    });

    socket.on("disconnect", () => {
      setSocketState("disconnected");
    });

    socket.on("chat:join:ack", () => setError(""));

    socket.on("chat:message", (event: {
      chatId: number;
      senderId: number;
      messageId: number;
      ciphertext: string;
      createdAt: string;
    }) => {
      const text = decryptForDemo(event.ciphertext);
      setMessages((prev) => {
        if (prev.some((item) => item.id === String(event.messageId))) return prev;
        return [
          ...prev,
          {
            id: String(event.messageId),
            chatId: Number(event.chatId),
            senderId: Number(event.senderId),
            text,
            sentAt: event.createdAt,
            receipt: Number(event.senderId) === Number(currentUserId) ? "sent" : undefined,
          },
        ];
      });
    });

    socket.on("chat:ack", (event: { ok: boolean; clientMessageId: string; messageId: number }) => {
      if (!event.ok) return;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === event.clientMessageId
            ? { ...item, id: String(event.messageId), pending: false, queued: false, failed: false, receipt: "sent" }
            : item,
        ),
      );
    });

    socket.on("chat:receipt", (event: { messageId?: number; messageIds?: number[]; type: "delivered" | "seen" }) => {
      const ids = [event.messageId, ...(event.messageIds || [])].filter((v): v is number => Number.isFinite(v));
      if (!ids.length) return;
      setMessages((prev) => prev.map((item) => (ids.includes(Number(item.id)) ? { ...item, receipt: event.type } : item)));
    });

    socket.on("chat:typing", (event: { chatId: number; userId: number; state: "start" | "stop" }) => {
      if (Number(event.chatId) !== Number(activeChatId)) return;
      if (Number(event.userId) === Number(currentUserId)) return;
      setTypingText(event.state === "start" ? `User #${event.userId} is typing...` : "");
    });

    socket.on("socket:error", (event: { message?: string }) => {
      setError(event.message || "Socket operation failed");
    });

    return () => {
      if (heartbeatTimerRef.current) window.clearInterval(heartbeatTimerRef.current);
      socket.disconnect();
    };
  }, [session, activeChatId, currentUserId, networkOnline]);

  useEffect(() => {
    if (!session || socketState !== "connected") return;
    flushOutbox(session, socketRef.current).catch(() => undefined);
  }, [networkOnline, socketState]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoadingAuth(true);
    setError("");
    try {
      const auth = await login(username.trim(), password);
      const next: SessionState = {
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
      };
      saveSession(next);
      setSession(next);
      await loadWorkspace(next);
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function chooseChat(chatId: number) {
    if (!session) return;
    setActiveChatId(chatId);
    setTypingText("");
    setLoadingMessages(true);
    try {
      const items = await listMessages(session, chatId, 80);
      setMessages(items.reverse().map(mapEnvelopeToUi));
      socketRef.current?.emit("chat:join", { chatId });
    } finally {
      setLoadingMessages(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !activeChatId) return;
    const text = composer.trim();
    if (!text) return;

    const payload = {
      clientMessageId: nonce(),
      nonce: nonce(),
      ciphertext: encryptForDemo(text),
      sentAt: new Date().toISOString(),
      metadata: { mode: "demo" },
    };

    const optimistic: UiMessage = {
      id: payload.clientMessageId,
      chatId: activeChatId,
      senderId: currentUserId,
      text,
      sentAt: payload.sentAt,
      pending: true,
      queued: !networkOnline || socketState !== "connected",
      receipt: "sent",
    };

    setMessages((prev) => [...prev, optimistic]);
    setComposer("");

    if (!networkOnline || socketState !== "connected") {
      setOutbox((prev) => [...prev, { chatId: activeChatId, payload }]);
      return;
    }

    socketRef.current?.emit("chat:send", { chatId: activeChatId, ...payload });

    try {
      await postMessage(session, activeChatId, payload);
    } catch {
      setOutbox((prev) => [...prev, { chatId: activeChatId, payload }]);
      setMessages((prev) =>
        prev.map((m) => (m.id === payload.clientMessageId ? { ...m, queued: true } : m)),
      );
    }
  }

  function emitTyping() {
    if (!activeChatId || socketState !== "connected") return;
    socketRef.current?.emit("chat:typing:start", { chatId: activeChatId });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      socketRef.current?.emit("chat:typing:stop", { chatId: activeChatId });
      setTypingText("");
    }, 900);
  }

  function onLogout() {
    socketRef.current?.disconnect();
    clearSession();
    setSession(null);
    setChats([]);
    setMessages([]);
    setActiveChatId(null);
    setOutbox([]);
    setError("");
  }

  const activeMessages = messages.filter((m) => !activeChatId || m.chatId === activeChatId);

  if (!session) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={onLogin}>
          <p className="eyebrow">Gateway Login</p>
          <h1>Sign in to Secure Chat</h1>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" disabled={loadingAuth}>{loadingAuth ? "Signing in..." : "Sign in"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="chat-shell chat-shell--pro">
      <aside className="chat-sidebar">
        <header className="chat-sidebar__header">
          <div>
            <p className="eyebrow">Signed in</p>
            <h2>@{session.user.username}</h2>
          </div>
          <div className="chat-sidebar__actions">
            <Link className="btn btn--ghost btn--tiny" href="/chat/settings">Security</Link>
            <button className="btn btn--ghost btn--tiny" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <div className="status-strip">
          <span className={`status-pill ${networkOnline ? "ok" : "warn"}`}>{networkOnline ? "Online" : "Offline"}</span>
          <span className={`status-pill ${socketState === "connected" ? "ok" : "warn"}`}>{socketState}</span>
          <span className="status-pill neutral">Queue: {outbox.length}</span>
        </div>

        {loadingChats ? (
          <div className="skeleton-stack">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        ) : sortedChats.length === 0 ? (
          <p className="empty-copy">No chats yet. Create members in backend and join a chat.</p>
        ) : (
          <div className="chat-list">
            {sortedChats.map((chat) => (
              <button
                key={chat.chat_id}
                className={`chat-list-item ${activeChatId === chat.chat_id ? "active" : ""}`}
                onClick={() => chooseChat(chat.chat_id)}
              >
                <p>Chat #{chat.chat_id}</p>
                <small>{chat.message_count} encrypted envelopes</small>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="chat-main">
        <header className="chat-main__header">
          <h3>{activeChatId ? `Conversation ${activeChatId}` : "No chat selected"}</h3>
          <p>{typingText || "Zero-trust mode: encrypted envelopes, local decryption preview."}</p>
        </header>

        <div className="chat-stream">
          {loadingMessages ? (
            <div className="skeleton-stack">
              <div className="skeleton-bubble" />
              <div className="skeleton-bubble" />
              <div className="skeleton-bubble" />
            </div>
          ) : activeMessages.length === 0 ? (
            <p className="empty-copy">No messages in this chat yet.</p>
          ) : (
            activeMessages.map((message) => {
              const mine = Number(message.senderId) === Number(currentUserId);
              const meta = message.failed
                ? "failed"
                : message.queued
                  ? "queued"
                  : message.pending
                    ? "sending"
                    : message.receipt || "sent";

              return (
                <article key={`${message.id}-${message.sentAt}`} className={`bubble ${mine ? "mine" : "other"}`}>
                  <p>{message.text}</p>
                  <small>
                    {new Date(message.sentAt).toLocaleTimeString()}
                    {mine ? ` · ${meta}` : ""}
                  </small>
                </article>
              );
            })
          )}
        </div>

        <form className="chat-composer" onSubmit={sendMessage}>
          <input
            value={composer}
            onChange={(e) => {
              setComposer(e.target.value);
              emitTyping();
            }}
            placeholder={activeChatId ? "Type encrypted message..." : "Select chat first"}
            disabled={!activeChatId}
          />
          <button type="submit" disabled={!activeChatId || !composer.trim()}>Send</button>
        </form>

        {error ? <p className="chat-error">{error}</p> : null}
      </section>
    </main>
  );
}
