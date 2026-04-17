import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import fs from "fs";
import path from "path";

export type DB = ReturnType<typeof drizzle<typeof schema>>;

const dbCache = new Map<string, DB>();

export function getWorkspaceDb(dataDir: string, workspaceId: string): DB {
  const key = `${dataDir}::${workspaceId}`;
  if (dbCache.has(key)) {
    return dbCache.get(key)!;
  }

  const workspaceDir = path.join(dataDir, "workspaces", workspaceId);
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  const dbPath = path.join(workspaceDir, "data.db");
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  // Run migrations inline for now (simple create statements)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'spec',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      action_name TEXT NOT NULL,
      ticket_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate existing DBs: add description column if missing
  const ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (!ticketColumns.some((c) => c.name === "description")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }

  // Migrate existing DBs: add status column to action_runs if missing
  const actionRunColumns = sqlite.prepare("PRAGMA table_info(action_runs)").all() as Array<{ name: string }>;
  if (!actionRunColumns.some((c) => c.name === "status")) {
    sqlite.exec("ALTER TABLE action_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }

  dbCache.set(key, db);
  return db;
}
