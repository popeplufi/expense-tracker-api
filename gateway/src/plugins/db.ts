import fp from "fastify-plugin";
import { Pool } from "pg";

import { config } from "../config.js";

export const dbPlugin = fp(async (fastify) => {
  const db = new Pool({ connectionString: config.databaseUrl });

  await db.query("SELECT 1");
  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    await db.end();
  });
});
