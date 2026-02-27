import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/healthz", async () => ({ ok: true }));

  fastify.get("/readyz", async (_request, reply) => {
    try {
      await fastify.db.query("SELECT 1");
      await fastify.redis.ping();
      return { ok: true, status: "ready", service: "gateway" };
    } catch (error) {
      reply.status(503);
      return {
        ok: false,
        status: "degraded",
        service: "gateway",
        error: (error as Error).message
      };
    }
  });
};
