import fp from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";

import { config } from "../config.js";

export const rateLimitPlugin = fp(async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    redis: fastify.redis,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      ok: false,
      message: "Too many requests"
    })
  });
});
