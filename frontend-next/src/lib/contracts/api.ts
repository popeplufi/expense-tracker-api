export type IsoDateString = string;

export interface ApiEnvelope<T> {
  ok: boolean;
  message?: string;
  data?: T;
}

export interface AuthUser {
  id: number;
  username: string;
  email?: string | null;
  is_online: boolean;
  last_seen?: IsoDateString | null;
  created_at: IsoDateString;
}

export interface AuthResponse {
  ok: boolean;
  message: string;
  token: string;
  user: AuthUser;
}

export interface ChatMessage {
  id: number;
  chat_id: number;
  sender_id: number;
  sender_username: string;
  body: string;
  created_at: IsoDateString;
  is_seen: number | boolean;
}

export interface UnreadItem {
  chat_id: number;
  unread_count: number;
}

export interface UnreadSummary {
  items: UnreadItem[];
  total_unread: number;
}

export interface ReadyzResponse {
  ok: boolean;
  status: "ready" | "degraded";
  version: string;
  error?: string;
}

export function isReadyzResponse(value: unknown): value is ReadyzResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ReadyzResponse>;
  return (
    typeof v.ok === "boolean" &&
    (v.status === "ready" || v.status === "degraded") &&
    typeof v.version === "string"
  );
}
