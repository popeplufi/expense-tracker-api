import fp from "fastify-plugin";
import { Redis } from "ioredis";

import { config } from "../config.js";

export const redisPlugin = fp(async (fastify) => {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false
  });

  await redis.ping();
  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
});
