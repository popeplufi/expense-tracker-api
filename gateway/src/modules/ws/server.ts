import type { FastifyInstance } from "fastify";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server } from "socket.io";

import { config } from "../../config.js";

export async function attachWebsocketServer(fastify: FastifyInstance): Promise<Server> {
  const io = new Server(fastify.server, {
    path: "/ws",
    cors: {
      origin: config.corsOrigin,
      credentials: true
    }
  });

  const pub = new Redis(config.redisUrl);
  const sub = pub.duplicate();
  await Promise.all([pub.connect().catch(() => undefined), sub.connect().catch(() => undefined)]);
  io.adapter(createAdapter(pub, sub));

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.headers.authorization;
      const accessToken = typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "") : "";
      if (!accessToken) {
        return next(new Error("Missing access token"));
      }

      const payload = fastify.jwt.verify(accessToken, {
        secret: config.jwt.accessSecret
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
        sessionId: payload.sessionId
      };

      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.authUser;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${user.userId}`);

    socket.on("presence:update", async (payload: { online: boolean }) => {
      await fastify.redis.hset("presence:users", String(user.userId), payload.online ? "1" : "0");
      io.emit("presence:changed", {
        userId: user.userId,
        online: payload.online
      });
    });

    socket.on("chat:publish", async (payload: { chatId: number; ciphertext: string; meta?: unknown }) => {
      if (!payload?.chatId || !payload?.ciphertext) return;
      const event = {
        chatId: payload.chatId,
        senderId: user.userId,
        ciphertext: payload.ciphertext,
        meta: payload.meta || null,
        sentAt: new Date().toISOString()
      };
      await fastify.redis.publish(`chat:${payload.chatId}`, JSON.stringify(event));
      io.to(`chat:${payload.chatId}`).emit("chat:message", event);
    });

    socket.on("chat:join", (payload: { chatId: number }) => {
      if (!payload?.chatId) return;
      socket.join(`chat:${payload.chatId}`);
    });

    socket.on("disconnect", () => {
      // Presence can be reconciled by heartbeat or multi-device strategy.
    });
  });

  fastify.addHook("onClose", async () => {
    await Promise.all([pub.quit(), sub.quit()]);
    io.removeAllListeners();
  });

  return io;
}
