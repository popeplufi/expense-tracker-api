import fp from "fastify-plugin";

export const auditPlugin = fp(async (fastify) => {
  fastify.addHook("onResponse", async (request, reply) => {
    const startedAt = (request as any).__startedAt as number | undefined;
    const durationMs = startedAt ? Date.now() - startedAt : 0;
    const actor = request.authUser;

    const routePath = request.routeOptions.url || request.url;

    try {
      await fastify.db.query(
        `
        INSERT INTO audit_logs (
          actor_user_id,
          actor_username,
          action,
          method,
          path,
          status_code,
          ip_address,
          user_agent,
          metadata,
          duration_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
        `,
        [
          actor?.userId ?? null,
          actor?.username ?? null,
          "http_request",
          request.method,
          routePath,
          reply.statusCode,
          request.ip,
          request.headers["user-agent"] ?? null,
          JSON.stringify({ requestId: request.id }),
          durationMs
        ]
      );
    } catch (error) {
      request.log.error({ error }, "failed to persist audit log");
    }
  });

  fastify.addHook("onRequest", async (request) => {
    (request as any).__startedAt = Date.now();
  });
});
