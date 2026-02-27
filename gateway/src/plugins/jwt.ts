import fp from "fastify-plugin";
import fastifyJwt, { FastifyJWT } from "@fastify/jwt";

import { config } from "../config.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      userId: number;
      username: string;
      sessionId: string;
      tokenType: "access" | "refresh";
    };
    user: {
      userId: number;
      username: string;
      sessionId: string;
      tokenType: "access" | "refresh";
    };
  }
}

export const jwtPlugin = fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: config.jwt.accessSecret,
    sign: { expiresIn: config.jwt.accessTtlSeconds }
  });

  fastify.decorate("verifyAccessToken", async (request: any) => {
    await request.jwtVerify();
    if (request.user.tokenType !== "access") {
      throw fastify.httpErrors.unauthorized("Invalid token type");
    }
    request.authUser = {
      userId: request.user.userId,
      username: request.user.username,
      sessionId: request.user.sessionId
    };
  });
});

declare module "fastify" {
  interface FastifyInstance {
    verifyAccessToken: (request: any) => Promise<void>;
  }
}
