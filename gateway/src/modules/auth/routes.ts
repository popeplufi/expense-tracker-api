import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

import { loginWithPassword, revokeSession, rotateRefreshToken } from "./service.js";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/auth/login",
    {
      schema: {
        body: Type.Object({
          username: Type.String({ minLength: 3 }),
          password: Type.String({ minLength: 6 })
        })
      }
    },
    async (request, reply) => {
      const { username, password } = request.body as { username: string; password: string };
      const result = await loginWithPassword(
        fastify,
        username,
        password,
        request.headers["user-agent"] ?? null,
        request.ip
      );
      return reply.send({ ok: true, ...result });
    }
  );

  fastify.post(
    "/v1/auth/refresh",
    {
      schema: {
        body: Type.Object({
          refreshToken: Type.String({ minLength: 20 })
        })
      }
    },
    async (request, reply) => {
      const { refreshToken } = request.body as { refreshToken: string };
      const result = await rotateRefreshToken(
        fastify,
        refreshToken,
        request.headers["user-agent"] ?? null,
        request.ip
      );
      return reply.send({ ok: true, ...result });
    }
  );

  fastify.post(
    "/v1/auth/logout",
    {
      preHandler: fastify.verifyAccessToken,
      schema: {
        body: Type.Optional(
          Type.Object({
            sessionId: Type.Optional(Type.String())
          })
        )
      }
    },
    async (request, reply) => {
      const requestedSession = (request.body as { sessionId?: string } | undefined)?.sessionId;
      const sessionId = requestedSession || request.authUser?.sessionId;
      if (!sessionId) {
        throw fastify.httpErrors.badRequest("Missing session id");
      }
      await revokeSession(fastify, sessionId);
      return reply.send({ ok: true, message: "Logged out" });
    }
  );
};
