export interface SessionUser {
  id: number;
  username: string;
}

export interface SessionState {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const SESSION_KEY = "gateway_session_v1";

export function loadSession(): SessionState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SessionState;
    if (!value?.accessToken || !value?.refreshToken || !value?.user?.username) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveSession(session: SessionState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}
