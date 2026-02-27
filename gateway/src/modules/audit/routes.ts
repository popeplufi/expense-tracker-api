import type { FastifyPluginAsync } from "fastify";

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/v1/audit/logs",
    { preHandler: fastify.verifyAccessToken },
    async (request) => {
      const limitRaw = Number((request.query as { limit?: string }).limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

      const rows = await fastify.db.query(
        `
        SELECT id, actor_user_id, actor_username, action, method, path, status_code, ip_address, user_agent, metadata, duration_ms, created_at
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [limit]
      );

      return { ok: true, items: rows.rows };
    }
  );
};
