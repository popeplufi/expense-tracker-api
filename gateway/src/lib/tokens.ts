import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

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
  _fastify: FastifyInstance,
  payload: { userId: number; username: string; sessionId: string }
): Promise<string> {
  return jwt.sign({ ...payload, tokenType: "access" }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtlSeconds
  });
}

export async function signRefreshToken(
  _fastify: FastifyInstance,
  payload: { userId: number; username: string; sessionId: string }
): Promise<string> {
  return jwt.sign({ ...payload, tokenType: "refresh" }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtlSeconds
  });
}

export async function verifyRefreshJwt(
  _fastify: FastifyInstance,
  token: string
): Promise<{ userId: number; username: string; sessionId: string; tokenType: string }> {
  return jwt.verify(token, config.jwt.refreshSecret) as {
    userId: number;
    username: string;
    sessionId: string;
    tokenType: string;
  };
}
