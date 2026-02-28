import type { SessionState } from "@/lib/auth/session";

const API_BASE = process.env.NEXT_PUBLIC_GATEWAY_HTTP_BASE || "http://127.0.0.1:4000";

export interface GatewayAuthResponse {
  ok: boolean;
  accessToken: string;
  refreshToken: string;
  user: {
    id: number;
    username: string;
  };
}

export interface ChatSummary {
  chat_id: number;
  last_created_at: string | null;
  message_count: number;
  title?: string;
  unread_count?: number;
  last_preview?: string | null;
}

export interface ChatEnvelope {
  id: number;
  chat_id: number;
  sender_user_id: number;
  client_message_id: string;
  ciphertext: string;
  nonce: string;
  sent_at_client: string;
  metadata: Record<string, unknown>;
  created_at: string;
  sender_username?: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const payload = await parseJson<{ ok?: boolean; message?: string } & T>(response);
  if (!response.ok) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return payload as T;
}

export async function login(username: string, password: string): Promise<GatewayAuthResponse> {
  return request<GatewayAuthResponse>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function refresh(refreshToken: string): Promise<GatewayAuthResponse> {
  return request<GatewayAuthResponse>("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function authRequest<T>(
  session: SessionState,
  path: string,
  init?: RequestInit,
): Promise<T> {
  return request<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(init?.headers || {}),
    },
  });
}

export async function listChats(session: SessionState): Promise<ChatSummary[]> {
  const payload = await authRequest<{ ok: boolean; items: ChatSummary[] }>(session, "/v1/chats", {
    method: "GET",
  });
  return payload.items || [];
}

export async function listMessages(
  session: SessionState,
  chatId: number,
  limit = 60,
): Promise<ChatEnvelope[]> {
  const payload = await authRequest<{ ok: boolean; items: ChatEnvelope[] }>(
    session,
    `/v1/chats/${chatId}/messages?limit=${limit}`,
    { method: "GET" },
  );
  return payload.items || [];
}

export async function postMessage(session: SessionState, chatId: number, payload: {
  clientMessageId: string;
  nonce: string;
  ciphertext: string;
  sentAt: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; messageId: number; duplicate: boolean }> {
  return authRequest(session, `/v1/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
