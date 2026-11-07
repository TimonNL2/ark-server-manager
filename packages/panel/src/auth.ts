import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getDb } from "./db.js";
import { panelConfig } from "./config.js";
import type { UserPublic } from "@ark-host/shared";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function ensureAdminUser(): void {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(panelConfig.adminUsername);
  if (existing) return;

  const id = nanoid();
  const hash = bcrypt.hashSync(panelConfig.adminPassword, 12);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, panelConfig.adminUsername, hash, now);
}

export function verifyLogin(username: string, password: string): UserPublic | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, username, password_hash, created_at FROM users WHERE username = ?")
    .get(username) as
    | { id: string; username: string; password_hash: string; created_at: string }
    | undefined;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function createSession(userId: string): string {
  const db = getDb();
  const id = nanoid(48);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, userId, expires.toISOString(), now.toISOString());
  return id;
}

export function destroySession(sessionId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function getUserFromSession(sessionId: string | undefined): UserPublic | null {
  if (!sessionId) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as
    | { id: string; username: string; created_at: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(sessionId);
    return null;
  }
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(panelConfig.cookieName, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: panelConfig.cookieSecure,
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(panelConfig.cookieName, { path: "/" });
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<UserPublic | null> {
  const sessionId = req.cookies[panelConfig.cookieName];
  const user = getUserFromSession(sessionId);
  if (!user) {
    reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  return user;
}
