"use client";

import { motion } from "framer-motion";

export default function Home() {
  return (
    <main id="main-content" className="site">
      <motion.section
        className="hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="hero__badge">Zero-Trust Real-Time Messaging Infrastructure</div>
        <h1>
          Built like a <span>systems product</span>, not a demo chat app.
        </h1>
        <p>
          Signal-grade principles with Slack-grade collaboration speed. End-to-end encrypted
          payloads, distributed sockets, and audit-ready operations from day one.
        </p>
        <div className="hero__actions">
          <a className="btn btn--solid" href="#architecture">
            Explore Architecture
          </a>
          <a className="btn btn--ghost" href="/chat">
            Open Workspace
          </a>
        </div>
      </motion.section>

      <motion.section
        id="architecture"
        className="panel panel--mesh"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <header className="panel__header">
          <p className="eyebrow">Architecture</p>
          <h2>Six independent layers. One coherent trust model.</h2>
        </header>
        <div className="layer-grid">
          {[
            ["01", "Client Layer", "Next.js + TypeScript + WebCrypto + encrypted IndexedDB cache"],
            ["02", "Identity & Keys", "Device registration, signed pre-keys, key rotation, revocation flow"],
            ["03", "Realtime Fabric", "WebSocket cluster, Redis adapter, presence and typing state machine"],
            ["04", "Message Pipeline", "Encrypted envelope ingest, pub/sub fanout, local decrypt at receiver"],
            ["05", "Data Plane", "PostgreSQL metadata, Redis presence, encrypted media object storage"],
            ["06", "Ops & SRE", "Docker, Nginx, CI/CD, observability, replay/rate-limit hardening"],
          ].map(([id, title, body]) => (
            <article key={id} className="layer-card">
              <p className="layer-card__id">{id}</p>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </motion.section>

      <motion.section
        className="panel"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <header className="panel__header">
          <p className="eyebrow">Message Lifecycle</p>
          <h2>Plaintext never leaves the device boundary.</h2>
        </header>
        <div className="pipeline">
          {[
            "Encrypt locally with session keys",
            "Gateway verifies token + replay window",
            "Encrypted blob persisted with metadata only",
            "Redis fanout dispatches to active recipients",
            "Recipient decrypts locally and updates receipts",
          ].map((step, index) => (
            <div key={step} className="pipeline__item">
              <span>{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        className="kpi-strip"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <article>
          <p className="kpi">E2E by Design</p>
          <p className="kpi-meta">Server stores ciphertext only</p>
        </article>
        <article>
          <p className="kpi">Horizontal Scale</p>
          <p className="kpi-meta">Socket clusters + Redis pub/sub</p>
        </article>
        <article>
          <p className="kpi">Rotating Sessions</p>
          <p className="kpi-meta">JWT access + refresh token rotation</p>
        </article>
        <article>
          <p className="kpi">Audit-Ready</p>
          <p className="kpi-meta">Request and security event trails</p>
        </article>
      </motion.section>
    </main>
  );
}
