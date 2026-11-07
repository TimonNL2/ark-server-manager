import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { panelConfig } from "./config.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) throw new Error("Database not initialized");
  return db;
}

export function initDb(): Database.Database {
  fs.mkdirSync(path.dirname(panelConfig.dbPath), { recursive: true });
  db = new Database(panelConfig.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clusters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cluster_id TEXT NOT NULL UNIQUE,
      transfer_inventory INTEGER NOT NULL DEFAULT 1,
      transfer_dinos INTEGER NOT NULL DEFAULT 1,
      transfer_tribute INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instances (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      edition TEXT NOT NULL CHECK (edition IN ('ASA', 'ASE')),
      map_id TEXT NOT NULL,
      session_name TEXT NOT NULL,
      game_port INTEGER NOT NULL,
      query_port INTEGER NOT NULL,
      rcon_port INTEGER NOT NULL,
      max_players INTEGER NOT NULL DEFAULT 70,
      admin_password TEXT NOT NULL,
      server_password TEXT,
      cluster_ref TEXT REFERENCES clusters(id) ON DELETE SET NULL,
      install_path TEXT NOT NULL,
      extra_args TEXT NOT NULL DEFAULT '',
      auto_start INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_instances_cluster ON instances(cluster_ref);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  return db;
}
