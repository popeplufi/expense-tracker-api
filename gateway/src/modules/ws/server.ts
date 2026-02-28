import type { FastifyInstance } from "fastify";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Socket } from "socket.io";
import { Server } from "socket.io";

import { config } from "../../config.js";

type SocketUser = {
  userId: number;
  username: string;
  sessionId: string;
};

type ChatSendPayload = {
  chatId: number;
  clientMessageId: string;
  nonce: string;
  ciphertext: string;
  sentAt: string;
  metadata?: Record<string, unknown>;
};

const MESSAGE_RATE_TRACKER = new Map<number, number[]>();

function normalizeToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function nowMs(): number {
  return Date.now();
}

function withinReplayWindow(sentAt: string): boolean {
  const sent = Date.parse(sentAt);
  if (!Number.isFinite(sent)) return false;
  return Math.abs(nowMs() - sent) <= config.ws.replayWindowMs;
}

function socketBackpressure(socket: Socket): number {
  return ((socket.conn as unknown as { writeBuffer?: unknown[] }).writeBuffer ?? []).length;
}

function emitSocketError(socket: Socket, code: string, message: string): void {
  socket.emit("socket:error", { code, message });
}

function enforceBackpressure(socket: Socket): boolean {
  if (socketBackpressure(socket) <= config.ws.maxQueueSize) return true;
  emitSocketError(socket, "backpressure", "Socket queue overloaded");
  socket.disconnect(true);
  return false;
}

function consumeMessageQuota(userId: number): boolean {
  const now = nowMs();
  const bucket = MESSAGE_RATE_TRACKER.get(userId) ?? [];
  const filtered = bucket.filter((ts) => now - ts <= config.ws.messageWindowMs);
  if (filtered.length >= config.ws.maxMessagesPerWindow) {
    MESSAGE_RATE_TRACKER.set(userId, filtered);
    return false;
  }
  filtered.push(now);
  MESSAGE_RATE_TRACKER.set(userId, filtered);
  return true;
}

async function isChatMember(fastify: FastifyInstance, userId: number, chatId: number): Promise<boolean> {
  const row = await fastify.db.query<{ exists: number }>(
    `SELECT 1 as exists FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1`,
    [chatId, userId],
  );
  return Boolean(row.rows[0]?.exists);
}

async function chatMemberIds(fastify: FastifyInstance, chatId: number): Promise<number[]> {
  const rows = await fastify.db.query<{ user_id: number }>(
    `SELECT user_id FROM chat_members WHERE chat_id = $1`,
    [chatId],
  );
  return rows.rows.map((r) => Number(r.user_id));
}

async function persistEnvelope(
  fastify: FastifyInstance,
  user: SocketUser,
  payload: ChatSendPayload,
): Promise<{ id: number; createdAt: string; duplicate: boolean }> {
  const inserted = await fastify.db.query<{ id: number; created_at: string }>(
    `
    INSERT INTO message_envelopes (
      chat_id,
      sender_user_id,
      client_message_id,
      ciphertext,
      nonce,
      sent_at_client,
      metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT (sender_user_id, client_message_id) DO NOTHING
    RETURNING id, created_at
    `,
    [
      payload.chatId,
      user.userId,
      payload.clientMessageId,
      payload.ciphertext,
      payload.nonce,
      payload.sentAt,
      JSON.stringify(payload.metadata ?? {}),
    ],
  );

  if (inserted.rowCount && inserted.rows[0]) {
    const id = Number(inserted.rows[0].id);
    await fastify.db.query(
      `
      INSERT INTO message_receipts (message_id, recipient_user_id, delivered_at, seen_at)
      SELECT $1, cm.user_id, NULL, NULL
      FROM chat_members cm
      WHERE cm.chat_id = $2 AND cm.user_id <> $3
      ON CONFLICT (message_id, recipient_user_id) DO NOTHING
      `,
      [id, payload.chatId, user.userId],
    );
    return { id, createdAt: inserted.rows[0].created_at, duplicate: false };
  }

  const existing = await fastify.db.query<{ id: number; created_at: string }>(
    `
    SELECT id, created_at
    FROM message_envelopes
    WHERE sender_user_id = $1 AND client_message_id = $2
    LIMIT 1
    `,
    [user.userId, payload.clientMessageId],
  );

  if (!existing.rows[0]) {
    throw new Error("Failed to persist message envelope");
  }

  return {
    id: Number(existing.rows[0].id),
    createdAt: existing.rows[0].created_at,
    duplicate: true,
  };
}

async function updateDeliveredReceipts(
  fastify: FastifyInstance,
  messageId: number,
  recipientIds: number[],
): Promise<void> {
  if (!recipientIds.length) return;
  await fastify.db.query(
    `
    UPDATE message_receipts
    SET delivered_at = COALESCE(delivered_at, NOW())
    WHERE message_id = $1 AND recipient_user_id = ANY($2::bigint[])
    `,
    [messageId, recipientIds],
  );
}

export async function attachWebsocketServer(fastify: FastifyInstance): Promise<Server> {
  const io = new Server(fastify.server, {
    path: "/ws",
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
  });

  const pub = fastify.redis.duplicate();
  const sub = fastify.redis.duplicate();
  await Promise.all([pub.ping(), sub.ping()]);
  io.adapter(createAdapter(pub, sub));

  const lastHeartbeatBySocket = new Map<string, number>();

  const heartbeatSweep = setInterval(() => {
    const now = nowMs();
    for (const [socketId, lastHeartbeat] of lastHeartbeatBySocket.entries()) {
      if (now - lastHeartbeat <= config.ws.heartbeatTimeoutMs) continue;
      const staleSocket = io.sockets.sockets.get(socketId);
      if (!staleSocket) {
        lastHeartbeatBySocket.delete(socketId);
        continue;
      }
      emitSocketError(staleSocket, "heartbeat_timeout", "Heartbeat timeout");
      staleSocket.disconnect(true);
      lastHeartbeatBySocket.delete(socketId);
    }
  }, config.ws.heartbeatIntervalMs);

  io.use(async (socket, next) => {
    try {
      const authToken = socket.handshake.auth?.token;
      const headerToken = socket.handshake.headers.authorization;
      const accessToken = normalizeToken(authToken || headerToken);
      if (!accessToken) return next(new Error("Missing access token"));

      const payload = fastify.jwt.verify(accessToken, {
        secret: config.jwt.accessSecret,
      }) as {
        userId: number;
        username: string;
        sessionId: string;
        tokenType: "access" | "refresh";
      };

      if (payload.tokenType !== "access") {
        return next(new Error("Invalid token type"));
      }

      socket.authUser = {
        userId: payload.userId,
        username: payload.username,
        sessionId: payload.sessionId,
      };
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.authUser;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    lastHeartbeatBySocket.set(socket.id, nowMs());
    socket.join(`user:${user.userId}`);

    const connections = await fastify.redis.hincrby("presence:connections", String(user.userId), 1);
    await fastify.redis.hset("presence:users", String(user.userId), "online");
    await fastify.redis.hset("presence:last_seen", String(user.userId), new Date().toISOString());

    if (connections === 1) {
      io.emit("presence:changed", {
        userId: user.userId,
        state: "online",
      });
    }

    socket.on("presence:heartbeat", async () => {
      lastHeartbeatBySocket.set(socket.id, nowMs());
      await fastify.redis.hset("presence:last_seen", String(user.userId), new Date().toISOString());
      if (!enforceBackpressure(socket)) return;
      socket.emit("presence:heartbeat:ack", { t: new Date().toISOString() });
    });

    socket.on("chat:join", async (payload: { chatId: number }) => {
      if (!payload?.chatId || !Number.isFinite(payload.chatId)) {
        emitSocketError(socket, "invalid_chat", "Invalid chat id");
        return;
      }
      const allowed = await isChatMember(fastify, user.userId, Number(payload.chatId));
      if (!allowed) {
        emitSocketError(socket, "forbidden", "Not a member of this chat");
        return;
      }
      socket.join(`chat:${payload.chatId}`);
      if (!enforceBackpressure(socket)) return;
      socket.emit("chat:join:ack", { chatId: Number(payload.chatId), ok: true });
    });

    socket.on("chat:typing:start", async (payload: { chatId: number }) => {
      if (!payload?.chatId || !Number.isFinite(payload.chatId)) return;
      const chatId = Number(payload.chatId);
      if (!(await isChatMember(fastify, user.userId, chatId))) return;
      await fastify.redis.set(`typing:${chatId}:${user.userId}`, "1", "PX", 8_000);
      socket.to(`chat:${chatId}`).emit("chat:typing", {
        chatId,
        userId: user.userId,
        state: "start",
      });
    });

    socket.on("chat:typing:stop", async (payload: { chatId: number }) => {
      if (!payload?.chatId || !Number.isFinite(payload.chatId)) return;
      const chatId = Number(payload.chatId);
      if (!(await isChatMember(fastify, user.userId, chatId))) return;
      await fastify.redis.del(`typing:${chatId}:${user.userId}`);
      socket.to(`chat:${chatId}`).emit("chat:typing", {
        chatId,
        userId: user.userId,
        state: "stop",
      });
    });

    socket.on("chat:send", async (payload: ChatSendPayload) => {
      try {
        if (!consumeMessageQuota(user.userId)) {
          emitSocketError(socket, "rate_limited", "Too many messages");
          return;
        }

        if (
          !payload ||
          !Number.isFinite(payload.chatId) ||
          !payload.clientMessageId ||
          !payload.nonce ||
          !payload.ciphertext ||
          !payload.sentAt
        ) {
          emitSocketError(socket, "bad_payload", "Invalid chat:send payload");
          return;
        }

        if (!withinReplayWindow(payload.sentAt)) {
          emitSocketError(socket, "replay_window", "Message outside replay window");
          return;
        }

        const cipherBytes = Buffer.byteLength(payload.ciphertext, "utf8");
        if (cipherBytes > config.ws.maxCiphertextBytes) {
          emitSocketError(socket, "payload_too_large", "Ciphertext too large");
          return;
        }

        const chatId = Number(payload.chatId);
        const allowed = await isChatMember(fastify, user.userId, chatId);
        if (!allowed) {
          emitSocketError(socket, "forbidden", "Not a member of this chat");
          return;
        }

        const replayKey = `replay:${user.userId}:${payload.nonce}`;
        const replayGuard = await fastify.redis.set(replayKey, "1", "NX", "PX", config.ws.replayWindowMs);
        if (!replayGuard) {
          emitSocketError(socket, "replay_nonce", "Nonce already used");
          return;
        }

        const stored = await persistEnvelope(fastify, user, {
          ...payload,
          chatId,
        });

        const envelope = {
          messageId: stored.id,
          chatId,
          senderId: user.userId,
          clientMessageId: payload.clientMessageId,
          nonce: payload.nonce,
          ciphertext: payload.ciphertext,
          metadata: payload.metadata ?? {},
          sentAtClient: payload.sentAt,
          createdAt: stored.createdAt,
          duplicate: stored.duplicate,
        };

        if (!enforceBackpressure(socket)) return;
        socket.emit("chat:ack", {
          ok: true,
          chatId,
          clientMessageId: payload.clientMessageId,
          messageId: stored.id,
          duplicate: stored.duplicate,
        });

        io.to(`chat:${chatId}`).emit("chat:message", envelope);

        const socketsInRoom = await io.in(`chat:${chatId}`).fetchSockets();
        const onlineRecipientIds = socketsInRoom
          .map((s) => s.authUser?.userId)
          .filter((id): id is number => Number.isFinite(id))
          .filter((id) => id !== user.userId);

        const uniqueRecipients = Array.from(new Set(onlineRecipientIds));
        await updateDeliveredReceipts(fastify, stored.id, uniqueRecipients);

        if (uniqueRecipients.length > 0) {
          io.to(`chat:${chatId}`).emit("chat:receipt", {
            chatId,
            messageId: stored.id,
            type: "delivered",
            recipientIds: uniqueRecipients,
            at: new Date().toISOString(),
          });
        }
      } catch {
        emitSocketError(socket, "send_failed", "Failed to process message");
      }
    });

    socket.on("chat:seen", async (payload: { chatId: number; messageIds: number[] }) => {
      try {
        const chatId = Number(payload?.chatId);
        if (!Number.isFinite(chatId) || !Array.isArray(payload?.messageIds) || payload.messageIds.length === 0) {
          emitSocketError(socket, "bad_payload", "Invalid chat:seen payload");
          return;
        }

        const allowed = await isChatMember(fastify, user.userId, chatId);
        if (!allowed) {
          emitSocketError(socket, "forbidden", "Not a member of this chat");
          return;
        }

        const ids = payload.messageIds.filter((id) => Number.isFinite(id)).map((id) => Number(id));
        if (ids.length === 0) return;

        const updated = await fastify.db.query<{ message_id: number }>(
          `
          UPDATE message_receipts r
          SET seen_at = COALESCE(r.seen_at, NOW())
          FROM message_envelopes m
          WHERE r.message_id = m.id
            AND m.chat_id = $1
            AND r.recipient_user_id = $2
            AND r.message_id = ANY($3::bigint[])
          RETURNING r.message_id
          `,
          [chatId, user.userId, ids],
        );

        const seenIds = updated.rows.map((r) => Number(r.message_id));
        if (seenIds.length === 0) return;

        io.to(`chat:${chatId}`).emit("chat:receipt", {
          chatId,
          messageIds: seenIds,
          type: "seen",
          userId: user.userId,
          at: new Date().toISOString(),
        });
      } catch {
        emitSocketError(socket, "seen_failed", "Failed to process seen receipt");
      }
    });

    socket.on("disconnect", async () => {
      lastHeartbeatBySocket.delete(socket.id);
      const userId = user.userId;
      MESSAGE_RATE_TRACKER.delete(userId);

      const remaining = await fastify.redis.hincrby("presence:connections", String(userId), -1);
      await fastify.redis.hset("presence:last_seen", String(userId), new Date().toISOString());

      if (remaining <= 0) {
        await fastify.redis.hset("presence:users", String(userId), "offline");
        io.emit("presence:changed", {
          userId,
          state: "offline",
        });
      }
    });
  });

  fastify.addHook("onClose", async () => {
    clearInterval(heartbeatSweep);
    await Promise.all([pub.quit(), sub.quit()]);
    io.removeAllListeners();
  });

  return io;
}
