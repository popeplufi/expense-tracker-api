import type { FastifyPluginAsync } from "fastify";

import { config } from "../../config.js";
import { registry } from "../../plugins/metrics.js";

export const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/metrics", async (_request, reply) => {
    if (!config.metrics.enabled) {
      reply.status(404);
      return { ok: false, message: "Metrics disabled" };
    }

    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });
};
