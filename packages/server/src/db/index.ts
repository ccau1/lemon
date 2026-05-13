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
      status TEXT NOT NULL DEFAULT 'pending',
      step TEXT NOT NULL DEFAULT 'spec',
      state TEXT NOT NULL DEFAULT 'idle',
      external_source TEXT,
      external_source_id TEXT,
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

    CREATE TABLE IF NOT EXISTS event_action_linkages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL,
      event TEXT NOT NULL,
      action_run_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS step_runs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      step TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      model_id TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL
    );
  `);

  // Migrate existing DBs: add description column if missing
  const ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (!ticketColumns.some((c) => c.name === "description")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }

  // Migrate existing DBs: add missing columns to action_runs
  const actionRunColumns = sqlite.prepare("PRAGMA table_info(action_runs)").all() as Array<{ name: string }>;
  if (!actionRunColumns.some((c) => c.name === "workspace_id")) {
    sqlite.exec("ALTER TABLE action_runs ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''");
  }
  if (!actionRunColumns.some((c) => c.name === "status")) {
    sqlite.exec("ALTER TABLE action_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }

  // Migrate existing DBs: ensure event_action_linkages has all required columns
  const linkageColumns = sqlite.prepare("PRAGMA table_info(event_action_linkages)").all() as Array<{ name: string }>;
  if (linkageColumns.length > 0 && !linkageColumns.some((c) => c.name === "workspace_id")) {
    sqlite.exec("ALTER TABLE event_action_linkages ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''");
  }
  if (linkageColumns.length > 0 && !linkageColumns.some((c) => c.name === "ticket_id")) {
    sqlite.exec("ALTER TABLE event_action_linkages ADD COLUMN ticket_id TEXT NOT NULL DEFAULT ''");
  }
  if (linkageColumns.length > 0 && !linkageColumns.some((c) => c.name === "event")) {
    sqlite.exec("ALTER TABLE event_action_linkages ADD COLUMN event TEXT NOT NULL DEFAULT ''");
  }
  if (linkageColumns.length > 0 && !linkageColumns.some((c) => c.name === "action_run_id")) {
    sqlite.exec("ALTER TABLE event_action_linkages ADD COLUMN action_run_id TEXT NOT NULL DEFAULT ''");
  }
  if (linkageColumns.length > 0 && !linkageColumns.some((c) => c.name === "status")) {
    sqlite.exec("ALTER TABLE event_action_linkages ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (linkageColumns.length > 0 && !linkageColumns.some((c) => c.name === "created_at")) {
    sqlite.exec("ALTER TABLE event_action_linkages ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  }

  // Migrate existing DBs: add workflow action trigger columns to tickets
  const ticketColumns2 = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (!ticketColumns2.some((c) => c.name === "current_step")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN current_step TEXT");
  }
  if (!ticketColumns2.some((c) => c.name === "step")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN step TEXT NOT NULL DEFAULT 'spec'");
    sqlite.exec("ALTER TABLE tickets ADD COLUMN state TEXT NOT NULL DEFAULT 'idle'");
    // Migrate existing status/current_step data into step/state/status
    sqlite.exec(`
      UPDATE tickets SET
        step = CASE
          WHEN status IN ('spec','plan','tasks','implement','done') THEN status
          WHEN current_step IS NOT NULL THEN current_step
          ELSE 'spec'
        END,
        state = CASE
          WHEN status IN ('spec','plan','tasks','implement','done') THEN 'idle'
          WHEN status = 'queued' THEN 'queued'
          WHEN status = 'running' THEN 'running'
          WHEN status = 'awaiting_review' THEN 'awaiting_review'
          WHEN status = 'awaiting_actions' THEN 'awaiting_actions'
          WHEN status = 'error' THEN 'error'
          ELSE 'idle'
        END,
        status = CASE
          WHEN status = 'done' THEN 'done'
          WHEN status = 'error' THEN 'error'
          WHEN status = 'queued' OR status = 'running' THEN 'in_progress'
          WHEN status IN ('spec','plan','tasks','implement') THEN 'pending'
          ELSE 'pending'
        END
    `);
  }

  // Repair: ensure status is consistent with step/state (idempotent, fixes migration bugs)
  sqlite.exec(`UPDATE tickets SET state = 'done', status = 'done' WHERE step = 'done' AND (state != 'done' OR status != 'done')`);
  sqlite.exec(`UPDATE tickets SET status = 'error' WHERE state = 'error' AND status != 'error'`);
  sqlite.exec(`UPDATE tickets SET status = 'in_progress' WHERE state IN ('queued','running') AND status != 'in_progress'`);
  sqlite.exec(`UPDATE tickets SET status = 'pending' WHERE state IN ('idle','awaiting_review','awaiting_actions','stopped') AND status NOT IN ('pending','done','error','in_progress')`);

  // Repair: tickets incorrectly advanced to done despite task errors
  const doneTickets = sqlite.prepare("SELECT id FROM tickets WHERE step = 'done'").all() as Array<{ id: string }>;
  const repairStmt = sqlite.prepare("UPDATE tickets SET step = 'implement', state = 'error', status = 'error' WHERE id = ?");
  for (const { id } of doneTickets) {
    const tasksPath = path.join(workspaceDir, ".lemon", "tickets", id, "tasks.json");
    if (fs.existsSync(tasksPath)) {
      try {
        const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
        if (Array.isArray(tasks) && tasks.some((t: any) => t.status === "error")) {
          repairStmt.run(id);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  if (!ticketColumns2.some((c) => c.name === "pending_event")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN pending_event TEXT");
  }
  if (!ticketColumns2.some((c) => c.name === "resume_target")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN resume_target TEXT");
  }
  if (!ticketColumns2.some((c) => c.name === "external_source")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN external_source TEXT");
  }
  if (!ticketColumns2.some((c) => c.name === "external_source_id")) {
    sqlite.exec("ALTER TABLE tickets ADD COLUMN external_source_id TEXT");
  }

  dbCache.set(key, db);
  return db;
}
