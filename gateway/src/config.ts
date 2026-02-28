import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  databaseUrl: required("DATABASE_URL", "postgres://chat:chat@localhost:5432/chat"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret"),
    refreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret"),
    accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
    refreshTtlSeconds: Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 30)
  },
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX ?? 120),
    timeWindow: process.env.RATE_LIMIT_TIME_WINDOW ?? "1 minute"
  },
  ws: {
    heartbeatIntervalMs: Number(process.env.WS_HEARTBEAT_INTERVAL_MS ?? 10_000),
    heartbeatTimeoutMs: Number(process.env.WS_HEARTBEAT_TIMEOUT_MS ?? 30_000),
    maxQueueSize: Number(process.env.WS_MAX_QUEUE_SIZE ?? 200),
    maxCiphertextBytes: Number(process.env.WS_MAX_CIPHERTEXT_BYTES ?? 12_000),
    maxMessagesPerWindow: Number(process.env.WS_MAX_MESSAGES_PER_WINDOW ?? 20),
    messageWindowMs: Number(process.env.WS_MESSAGE_WINDOW_MS ?? 10_000),
    replayWindowMs: Number(process.env.WS_REPLAY_WINDOW_MS ?? 5 * 60 * 1000),
    envelopeHmacSecret: process.env.WS_ENVELOPE_HMAC_SECRET ?? ""
  },
  metrics: {
    enabled: (process.env.METRICS_ENABLED ?? "1") === "1"
  }
};
