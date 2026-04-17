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
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'spec',
      error_step TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS specs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      content TEXT NOT NULL,
      outdated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      description TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      comment TEXT,
      outdated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS implementations (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      content TEXT NOT NULL,
      outdated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS step_model_overrides (
      project_id TEXT NOT NULL,
      step TEXT NOT NULL,
      model_id TEXT NOT NULL,
      PRIMARY KEY (project_id, step)
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

    CREATE TABLE IF NOT EXISTS ticket_threads (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      step TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate existing DBs: add description column if missing
  const ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (!ticketColumns.some((c) => c.name === "description")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  if (!ticketColumns.some((c) => c.name === "error_step")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN error_step TEXT");
  }
  if (!ticketColumns.some((c) => c.name === "error_message")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN error_message TEXT");
  }

  // Migrate existing DBs: add status column to action_runs if missing
  const actionRunColumns = sqlite.prepare("PRAGMA table_info(action_runs)").all() as Array<{ name: string }>;
  if (!actionRunColumns.some((c) => c.name === "status")) {
    sqlite.exec("ALTER TABLE action_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }

  // Migrate existing DBs: add outdated column if missing
  const plansColumns = sqlite.prepare("PRAGMA table_info(plans)").all() as Array<{ name: string }>;
  if (!plansColumns.some((c) => c.name === "outdated")) {
    sqlite.exec("ALTER TABLE plans ADD COLUMN outdated INTEGER NOT NULL DEFAULT 0");
  }
  const tasksColumns = sqlite.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  if (!tasksColumns.some((c) => c.name === "comment")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN comment TEXT");
  }
  if (!tasksColumns.some((c) => c.name === "outdated")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN outdated INTEGER NOT NULL DEFAULT 0");
  }
  if (!tasksColumns.some((c) => c.name === "status")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'queued'");
  }
  if (!tasksColumns.some((c) => c.name === "error_message")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN error_message TEXT");
  }
  if (!tasksColumns.some((c) => c.name === "result")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN result TEXT");
  }
  const implColumns = sqlite.prepare("PRAGMA table_info(implementations)").all() as Array<{ name: string }>;
  if (!implColumns.some((c) => c.name === "outdated")) {
    sqlite.exec("ALTER TABLE implementations ADD COLUMN outdated INTEGER NOT NULL DEFAULT 0");
  }

  dbCache.set(key, db);
  return db;
}
