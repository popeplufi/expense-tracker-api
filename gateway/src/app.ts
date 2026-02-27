import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";

import { config } from "./config.js";
import { authRoutes } from "./modules/auth/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { deviceKeyRoutes } from "./modules/device-keys/routes.js";
import { auditPlugin } from "./plugins/audit.js";
import { dbPlugin } from "./plugins/db.js";
import { jwtPlugin } from "./plugins/jwt.js";
import { rateLimitPlugin } from "./plugins/rate-limit.js";
import { redisPlugin } from "./plugins/redis.js";
import { attachWebsocketServer } from "./modules/ws/server.js";

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });

  await app.register(sensible);
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true
  });

  await app.register(redisPlugin);
  await app.register(dbPlugin);
  await app.register(jwtPlugin);
  await app.register(rateLimitPlugin);
  await app.register(auditPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(deviceKeyRoutes);
  await app.register(auditRoutes);

  await attachWebsocketServer(app);

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as any).statusCode || 500;
    reply.status(statusCode).send({
      ok: false,
      message: error.message || "Internal server error"
    });
  });

  return app;
}
