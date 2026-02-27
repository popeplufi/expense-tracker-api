"use client";

import { useMemo, useState } from "react";

import { getReadyz } from "@/lib/api/client";
import { getEncryptedItem, setEncryptedItem } from "@/lib/storage/indexeddb";

interface DraftMessage {
  roomId: string;
  body: string;
  savedAt: number;
}

export function ArchitectureDemo() {
  const [apiStatus, setApiStatus] = useState("Not checked");
  const [roomId, setRoomId] = useState("conversation_1");
  const [message, setMessage] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [loadResult, setLoadResult] = useState("");

  const canPersist = useMemo(
    () => Boolean(roomId.trim() && message.trim() && passphrase.trim()),
    [roomId, message, passphrase],
  );

  const storageKey = useMemo(() => `draft:${roomId.trim() || "default"}`, [roomId]);

  async function checkBackend() {
    setApiStatus("Checking /readyz...");
    try {
      const result = await getReadyz();
      setApiStatus(`${result.status.toUpperCase()} | version=${result.version}`);
    } catch (error) {
      setApiStatus(`Failed: ${(error as Error).message}`);
    }
  }

  async function saveEncryptedDraft() {
    if (!canPersist) return;
    const payload: DraftMessage = {
      roomId,
      body: message,
      savedAt: Date.now(),
    };
    await setEncryptedItem(storageKey, payload, passphrase);
    setLoadResult("Encrypted draft saved to IndexedDB.");
  }

  async function loadEncryptedDraft() {
    if (!passphrase.trim()) return;
    try {
      const data = await getEncryptedItem<DraftMessage>(storageKey, passphrase);
      if (!data) {
        setLoadResult("No encrypted draft found for this room.");
        return;
      }
      setMessage(data.body);
      setLoadResult(`Loaded encrypted draft from ${new Date(data.savedAt).toLocaleString()}.`);
    } catch {
      setLoadResult("Failed to decrypt draft. Wrong passphrase or corrupted data.");
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <h1>Secure Realtime App Layer</h1>
        <p>
          Next.js + TypeScript foundation with typed contracts, readiness checks, WebCrypto encryption,
          Service Worker registration, and IndexedDB encrypted local storage.
        </p>
        <div className="row">
          <button onClick={checkBackend}>Check Backend Readiness</button>
          <code>{apiStatus}</code>
        </div>
      </section>

      <section className="card">
        <h2>Encrypted Draft Cache</h2>
        <label>
          Room ID
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="conversation_1" />
        </label>
        <label>
          Passphrase
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="local device key"
          />
        </label>
        <label>
          Draft Message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} />
        </label>
        <div className="row">
          <button disabled={!canPersist} onClick={saveEncryptedDraft}>Save Encrypted</button>
          <button disabled={!passphrase.trim()} onClick={loadEncryptedDraft}>Load Encrypted</button>
        </div>
        <p className="muted">{loadResult}</p>
      </section>
    </main>
  );
}
