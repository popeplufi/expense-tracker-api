import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/v1/chats",
    { preHandler: fastify.verifyAccessToken },
    async (request) => {
      const auth = request.authUser;
      if (!auth) throw fastify.httpErrors.unauthorized();

      const rows = await fastify.db.query<{
        chat_id: number;
        last_created_at: string | null;
        message_count: number;
      }>(
        `
        SELECT
          cm.chat_id,
          MAX(me.created_at) AS last_created_at,
          COUNT(me.id)::int AS message_count
        FROM chat_members cm
        LEFT JOIN message_envelopes me ON me.chat_id = cm.chat_id
        WHERE cm.user_id = $1
        GROUP BY cm.chat_id
        ORDER BY COALESCE(MAX(me.created_at), NOW()) DESC
        `,
        [auth.userId],
      );

      return { ok: true, items: rows.rows };
    },
  );

  fastify.get(
    "/v1/chats/:chatId/messages",
    {
      preHandler: fastify.verifyAccessToken,
      schema: {
        params: Type.Object({ chatId: Type.String() }),
        querystring: Type.Object({
          limit: Type.Optional(Type.String()),
          beforeId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      const auth = request.authUser;
      if (!auth) throw fastify.httpErrors.unauthorized();

      const chatId = Number((request.params as { chatId: string }).chatId);
      if (!Number.isFinite(chatId) || chatId <= 0) {
        throw fastify.httpErrors.badRequest("Invalid chat id");
      }

      const isMember = await fastify.db.query(
        "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1",
        [chatId, auth.userId],
      );
      if (!isMember.rows[0]) {
        throw fastify.httpErrors.forbidden("Not a member of this chat");
      }

      const query = request.query as { limit?: string; beforeId?: string };
      const limitRaw = Number(query.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
      const beforeIdRaw = Number(query.beforeId ?? 0);
      const beforeId = Number.isFinite(beforeIdRaw) && beforeIdRaw > 0 ? beforeIdRaw : null;

      const rows = await fastify.db.query(
        `
        SELECT
          me.id,
          me.chat_id,
          me.sender_user_id,
          me.client_message_id,
          me.ciphertext,
          me.nonce,
          me.sent_at_client,
          me.metadata,
          me.created_at
        FROM message_envelopes me
        WHERE me.chat_id = $1
          AND ($2::bigint IS NULL OR me.id < $2::bigint)
        ORDER BY me.id DESC
        LIMIT $3
        `,
        [chatId, beforeId, limit],
      );

      return {
        ok: true,
        items: rows.rows,
      };
    },
  );

  fastify.post(
    "/v1/chats/:chatId/messages",
    {
      preHandler: fastify.verifyAccessToken,
      schema: {
        params: Type.Object({ chatId: Type.String() }),
        body: Type.Object({
          clientMessageId: Type.String({ minLength: 4 }),
          nonce: Type.String({ minLength: 8 }),
          ciphertext: Type.String({ minLength: 16 }),
          sentAt: Type.String({ minLength: 10 }),
          metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
        }),
      },
    },
    async (request, reply) => {
      const auth = request.authUser;
      if (!auth) throw fastify.httpErrors.unauthorized();

      const chatId = Number((request.params as { chatId: string }).chatId);
      if (!Number.isFinite(chatId) || chatId <= 0) {
        throw fastify.httpErrors.badRequest("Invalid chat id");
      }

      const memberRow = await fastify.db.query(
        "SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1",
        [chatId, auth.userId],
      );
      if (!memberRow.rows[0]) {
        throw fastify.httpErrors.forbidden("Not a member of this chat");
      }

      const body = request.body as {
        clientMessageId: string;
        nonce: string;
        ciphertext: string;
        sentAt: string;
        metadata?: Record<string, unknown>;
      };

      const existing = await fastify.db.query<{ id: number }>(
        `
        SELECT id FROM message_envelopes
        WHERE sender_user_id = $1 AND client_message_id = $2
        LIMIT 1
        `,
        [auth.userId, body.clientMessageId],
      );

      if (existing.rows[0]) {
        return reply.send({ ok: true, messageId: existing.rows[0].id, duplicate: true });
      }

      const inserted = await fastify.db.query<{ id: number }>(
        `
        INSERT INTO message_envelopes (
          chat_id,
          sender_user_id,
          client_message_id,
          ciphertext,
          nonce,
          sent_at_client,
          metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
        RETURNING id
        `,
        [
          chatId,
          auth.userId,
          body.clientMessageId,
          body.ciphertext,
          body.nonce,
          body.sentAt,
          JSON.stringify(body.metadata ?? {}),
        ],
      );

      await fastify.db.query(
        `
        INSERT INTO message_receipts (message_id, recipient_user_id)
        SELECT $1, cm.user_id
        FROM chat_members cm
        WHERE cm.chat_id = $2 AND cm.user_id <> $3
        ON CONFLICT (message_id, recipient_user_id) DO NOTHING
        `,
        [inserted.rows[0].id, chatId, auth.userId],
      );

      return reply.code(201).send({ ok: true, messageId: inserted.rows[0].id, duplicate: false });
    },
  );
};
