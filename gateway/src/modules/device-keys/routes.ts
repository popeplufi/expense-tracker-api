import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";

export const deviceKeyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/v1/devices/keys",
    {
      preHandler: fastify.verifyAccessToken,
      schema: {
        body: Type.Object({
          deviceId: Type.String({ minLength: 8 }),
          identityPublicKey: Type.String({ minLength: 32 }),
          signedPreKey: Type.String({ minLength: 32 }),
          preKeys: Type.Array(Type.String({ minLength: 32 }), { minItems: 1 })
        })
      }
    },
    async (request, reply) => {
      const user = request.authUser;
      if (!user) throw fastify.httpErrors.unauthorized();

      const { deviceId, identityPublicKey, signedPreKey, preKeys } = request.body as {
        deviceId: string;
        identityPublicKey: string;
        signedPreKey: string;
        preKeys: string[];
      };

      await fastify.db.query(
        `
        INSERT INTO device_keys (
          user_id,
          device_id,
          identity_public_key,
          signed_pre_key,
          one_time_pre_keys,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
        ON CONFLICT (user_id, device_id)
        DO UPDATE SET
          identity_public_key = EXCLUDED.identity_public_key,
          signed_pre_key = EXCLUDED.signed_pre_key,
          one_time_pre_keys = EXCLUDED.one_time_pre_keys,
          updated_at = NOW()
        `,
        [
          user.userId,
          deviceId,
          identityPublicKey,
          signedPreKey,
          JSON.stringify(preKeys)
        ]
      );

      return reply.send({ ok: true, message: "Device keys registered" });
    }
  );

  fastify.get(
    "/v1/devices/keys/:userId",
    { preHandler: fastify.verifyAccessToken },
    async (request, reply) => {
      const requester = request.authUser;
      if (!requester) throw fastify.httpErrors.unauthorized();

      const userId = Number((request.params as { userId: string }).userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        throw fastify.httpErrors.badRequest("Invalid user id");
      }

      const client = await fastify.db.connect();
      try {
        await client.query("BEGIN");
        const bundleRes = await client.query<{
          id: number;
          device_id: string;
          identity_public_key: string;
          signed_pre_key: string;
          one_time_pre_keys: string[];
        }>(
          `
          SELECT id, device_id, identity_public_key, signed_pre_key, one_time_pre_keys
          FROM device_keys
          WHERE user_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
          FOR UPDATE
          `,
          [userId]
        );
        const row = bundleRes.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          throw fastify.httpErrors.notFound("No device key bundle found");
        }

        const keys = Array.isArray(row.one_time_pre_keys) ? row.one_time_pre_keys : [];
        const oneTimePreKey = keys.shift() ?? null;

        await client.query(
          "UPDATE device_keys SET one_time_pre_keys = $1::jsonb, updated_at = NOW() WHERE id = $2",
          [JSON.stringify(keys), row.id]
        );

        await client.query("COMMIT");
        return reply.send({
          ok: true,
          userId,
          deviceId: row.device_id,
          identityPublicKey: row.identity_public_key,
          signedPreKey: row.signed_pre_key,
          oneTimePreKey
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
  );
};
