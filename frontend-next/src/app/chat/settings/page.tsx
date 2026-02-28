"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { clearSession, loadSession, type SessionState } from "@/lib/auth/session";

const OUTBOX_KEY = "gateway_outbox_v1";

export default function ChatSettingsPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [outboxCount, setOutboxCount] = useState(0);

  useEffect(() => {
    setSession(loadSession());
    try {
      const raw = window.localStorage.getItem(OUTBOX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setOutboxCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setOutboxCount(0);
    }
  }, []);

  const cryptoReady = useMemo(
    () => typeof window !== "undefined" && !!window.crypto?.subtle,
    [],
  );

  function clearLocalState() {
    window.localStorage.removeItem(OUTBOX_KEY);
    clearSession();
    setOutboxCount(0);
    setSession(null);
  }

  return (
    <main className="settings-shell">
      <section className="settings-card">
        <header className="settings-header">
          <div>
            <p className="eyebrow">Security Center</p>
            <h1>Session & Device Trust</h1>
          </div>
          <Link className="btn btn--ghost btn--tiny" href="/chat">Back to chat</Link>
        </header>

        <div className="settings-grid">
          <article>
            <h3>Session</h3>
            <p>User: {session?.user.username ? `@${session.user.username}` : "Not logged in"}</p>
            <p>Access token: {session?.accessToken ? "Present" : "Missing"}</p>
            <p>Refresh token: {session?.refreshToken ? "Present" : "Missing"}</p>
          </article>

          <article>
            <h3>Crypto Runtime</h3>
            <p>WebCrypto: {cryptoReady ? "Available" : "Unavailable"}</p>
            <p>Local outbox queue: {outboxCount} pending messages</p>
            <p>Trust model: client-side encryption before transport</p>
          </article>

          <article>
            <h3>Gateway Endpoints</h3>
            <p>HTTP: {process.env.NEXT_PUBLIC_GATEWAY_HTTP_BASE || "http://127.0.0.1:4000"}</p>
            <p>WebSocket: {process.env.NEXT_PUBLIC_GATEWAY_WS_BASE || "http://127.0.0.1:4000"}</p>
            <p>Metrics path: /metrics</p>
          </article>
        </div>

        <div className="settings-actions">
          <button className="btn btn--solid" onClick={clearLocalState}>Clear local session and queue</button>
        </div>
      </section>
    </main>
  );
}
