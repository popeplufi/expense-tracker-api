import fs from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { config } from "../config.js";

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      version TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions(pool: Pool): Promise<Set<string>> {
  const res = await pool.query<{ version: string }>("SELECT version FROM schema_migrations");
  return new Set(res.rows.map((row) => row.version));
}

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await ensureMigrationsTable(pool);
    const done = await appliedVersions(pool);

    const migrationsDir = path.resolve(process.cwd(), "migrations");
    const entries = await fs.readdir(migrationsDir);
    const files = entries.filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sqlPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(sqlPath, "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    console.log("migrations complete");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
