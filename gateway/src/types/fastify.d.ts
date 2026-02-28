import type { Redis } from "ioredis";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
    db: Pool;
  }

  interface FastifyRequest {
    authUser?: {
      userId: number;
      username: string;
      sessionId: string;
    };
  }
}

declare module "socket.io" {
  interface Socket {
    authUser?: {
      userId: number;
      username: string;
      sessionId: string;
    };
  }
}
