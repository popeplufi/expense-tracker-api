import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

export function newSessionId(): string {
  return crypto.randomUUID();
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export async function hashRefreshToken(token: string): Promise<string> {
  return bcrypt.hash(token, 12);
}

export async function verifyRefreshTokenHash(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

export async function signAccessToken(
  fastify: FastifyInstance,
  payload: { userId: number; username: string; sessionId: string }
): Promise<string> {
  return fastify.jwt.sign({ ...payload, tokenType: "access" }, {
    expiresIn: config.jwt.accessTtlSeconds,
    secret: config.jwt.accessSecret
  });
}

export async function signRefreshToken(
  fastify: FastifyInstance,
  payload: { userId: number; username: string; sessionId: string }
): Promise<string> {
  return fastify.jwt.sign({ ...payload, tokenType: "refresh" }, {
    expiresIn: config.jwt.refreshTtlSeconds,
    secret: config.jwt.refreshSecret
  });
}

export async function verifyRefreshJwt(
  fastify: FastifyInstance,
  token: string
): Promise<{ userId: number; username: string; sessionId: string; tokenType: string }> {
  return fastify.jwt.verify(token, {
    secret: config.jwt.refreshSecret
  }) as { userId: number; username: string; sessionId: string; tokenType: string };
}
