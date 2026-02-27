import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";

import {
  hashRefreshToken,
  newRefreshToken,
  newSessionId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshJwt,
  verifyRefreshTokenHash
} from "../../lib/tokens.js";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: {
    id: number;
    username: string;
  };
}

export async function loginWithPassword(
  fastify: FastifyInstance,
  username: string,
  password: string,
  userAgent: string | null,
  ipAddress: string
): Promise<AuthTokens> {
  const result = await fastify.db.query<{
    id: number;
    username: string;
    password_hash: string;
  }>(
    "SELECT id, username, password_hash FROM users WHERE username = $1 LIMIT 1",
    [username]
  );

  const user = result.rows[0];
  if (!user) {
    throw fastify.httpErrors.unauthorized("Invalid username or password");
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw fastify.httpErrors.unauthorized("Invalid username or password");
  }

  const sessionId = newSessionId();
  const rawRefreshToken = newRefreshToken();
  const refreshHash = await hashRefreshToken(rawRefreshToken);

  await fastify.db.query(
    `
    INSERT INTO refresh_tokens (
      session_id,
      user_id,
      token_hash,
      is_revoked,
      replaced_by,
      user_agent,
      ip_address
    ) VALUES ($1,$2,$3,false,NULL,$4,$5)
    `,
    [sessionId, user.id, refreshHash, userAgent, ipAddress]
  );

  const accessJwt = await signAccessToken(fastify, {
    userId: user.id,
    username: user.username,
    sessionId
  });

  const refreshJwt = await signRefreshToken(fastify, {
    userId: user.id,
    username: user.username,
    sessionId
  });

  return {
    accessToken: accessJwt,
    refreshToken: `${refreshJwt}.${rawRefreshToken}`,
    sessionId,
    user: { id: user.id, username: user.username }
  };
}

export async function rotateRefreshToken(
  fastify: FastifyInstance,
  compoundRefreshToken: string,
  userAgent: string | null,
  ipAddress: string
): Promise<AuthTokens> {
  const parts = compoundRefreshToken.split(".");
  if (parts.length < 3) {
    throw fastify.httpErrors.unauthorized("Malformed refresh token");
  }

  const rawRefreshSecret = parts.pop() as string;
  const refreshJwt = parts.join(".");

  const payload = await verifyRefreshJwt(fastify, refreshJwt);
  if (payload.tokenType !== "refresh") {
    throw fastify.httpErrors.unauthorized("Invalid token type");
  }

  const tokenRow = await fastify.db.query<{
    id: string;
    token_hash: string;
    is_revoked: boolean;
    user_id: number;
    replaced_by: string | null;
  }>(
    "SELECT id, token_hash, is_revoked, user_id, replaced_by FROM refresh_tokens WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1",
    [payload.sessionId]
  );

  const token = tokenRow.rows[0];
  if (!token || token.is_revoked) {
    throw fastify.httpErrors.unauthorized("Refresh token revoked");
  }

  const hashMatches = await verifyRefreshTokenHash(rawRefreshSecret, token.token_hash);
  if (!hashMatches) {
    throw fastify.httpErrors.unauthorized("Invalid refresh token");
  }

  const userRow = await fastify.db.query<{ id: number; username: string }>(
    "SELECT id, username FROM users WHERE id = $1 LIMIT 1",
    [token.user_id]
  );
  const user = userRow.rows[0];
  if (!user) {
    throw fastify.httpErrors.unauthorized("User no longer exists");
  }

  const nextRawRefresh = newRefreshToken();
  const nextHash = await hashRefreshToken(nextRawRefresh);
  const nextSessionId = newSessionId();

  const insert = await fastify.db.query<{ id: string }>(
    `
    INSERT INTO refresh_tokens (
      session_id,
      user_id,
      token_hash,
      is_revoked,
      replaced_by,
      user_agent,
      ip_address
    ) VALUES ($1,$2,$3,false,NULL,$4,$5)
    RETURNING id
    `,
    [nextSessionId, user.id, nextHash, userAgent, ipAddress]
  );

  await fastify.db.query(
    "UPDATE refresh_tokens SET is_revoked = true, replaced_by = $1 WHERE id = $2",
    [insert.rows[0].id, token.id]
  );

  const accessToken = await signAccessToken(fastify, {
    userId: user.id,
    username: user.username,
    sessionId: nextSessionId
  });

  const refreshTokenJwt = await signRefreshToken(fastify, {
    userId: user.id,
    username: user.username,
    sessionId: nextSessionId
  });

  return {
    accessToken,
    refreshToken: `${refreshTokenJwt}.${nextRawRefresh}`,
    sessionId: nextSessionId,
    user: { id: user.id, username: user.username }
  };
}

export async function revokeSession(
  fastify: FastifyInstance,
  sessionId: string
): Promise<void> {
  await fastify.db.query(
    "UPDATE refresh_tokens SET is_revoked = true WHERE session_id = $1",
    [sessionId]
  );
}
