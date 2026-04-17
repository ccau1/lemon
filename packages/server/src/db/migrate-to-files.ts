import fs from "fs";
import path from "path";
import type { DB } from "./index.js";
import {
  writeSpec,
  writePlan,
  writeTasks,
  writeImplement,
  appendThreadMessages,
  archiveTicket,
  writeTicketState,
  writeTicketConf,
} from "../services/file-sync.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import { ConfigManager } from "../config/settings.js";
import type { WorkflowStep } from "@lemon/shared";

export async function migrateArtifactsToFiles(
  dataDir: string,
  registry: WorkspaceRegistry,
  configManager: ConfigManager
): Promise<void> {
  for (const ws of registry.list()) {
    const dbPath = path.join(dataDir, "workspaces", ws.id, "data.db");
    if (!fs.existsSync(dbPath)) continue;

    // Use a raw sqlite connection for inspection independent of the cached drizzle DB
    const { default: Database } = await import("better-sqlite3");
    const sqlite = new Database(dbPath);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    const hasOldArtifactTables =
      tableNames.includes("specs") ||
      tableNames.includes("plans") ||
      tableNames.includes("tasks") ||
      tableNames.includes("implementations") ||
      tableNames.includes("ticket_threads");

    const hasOldMetaTables =
      tableNames.includes("projects") ||
      tableNames.includes("step_model_overrides");

    const ticketColumns = sqlite.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
    const hasArchivedAt = ticketColumns.some((c) => c.name === "archived_at");
    const hasAutoApprove = ticketColumns.some((c) => c.name === "auto_approve");
    const hasErrorStep = ticketColumns.some((c) => c.name === "error_step");
    const hasErrorMessage = ticketColumns.some((c) => c.name === "error_message");

    const needsMigration =
      hasOldArtifactTables ||
      hasOldMetaTables ||
      hasArchivedAt ||
      hasAutoApprove ||
      hasErrorStep ||
      hasErrorMessage;

    if (!needsMigration) {
      sqlite.close();
      continue;
    }

    // Migrate projects to JSON file
    if (tableNames.includes("projects")) {
      const projectRows = sqlite.prepare("SELECT id, workspace_id, name, created_at, updated_at FROM projects").all() as Array<{
        id: string;
        workspace_id: string;
        name: string;
        created_at: string;
        updated_at: string;
      }>;
      const projectsPath = path.join(dataDir, "workspaces", ws.id, "projects.json");
      fs.writeFileSync(
        projectsPath,
        JSON.stringify(
          projectRows.map((r) => ({
            id: r.id,
            workspaceId: r.workspace_id,
            name: r.name,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          })),
          null,
          2
        ),
        "utf-8"
      );
    }

    // Migrate step_model_overrides into workspace config.yaml
    if (tableNames.includes("step_model_overrides")) {
      const overrideRows = sqlite
        .prepare("SELECT project_id, step, model_id FROM step_model_overrides")
        .all() as Array<{ project_id: string; step: string; model_id: string }>;
      const wsConfig = configManager.readWorkspace(ws.id);
      const merged: Record<string, Partial<Record<WorkflowStep, string>>> = { ...(wsConfig.stepModelOverrides ?? {}) };
      for (const r of overrideRows) {
        if (!merged[r.project_id]) merged[r.project_id] = {};
        merged[r.project_id][r.step as WorkflowStep] = r.model_id;
      }
      configManager.writeWorkspace(ws.id, { ...wsConfig, stepModelOverrides: merged });
    }

    // Migrate specs
    if (tableNames.includes("specs")) {
      const rows = sqlite.prepare("SELECT ticket_id, content FROM specs").all() as Array<{
        ticket_id: string;
        content: string;
      }>;
      for (const r of rows) {
        writeSpec(ws.path, r.ticket_id, r.content);
      }
    }

    // Migrate plans (only non-outdated; if multiple, latest wins)
    if (tableNames.includes("plans")) {
      const rows = sqlite
        .prepare("SELECT ticket_id, content, outdated FROM plans ORDER BY created_at DESC")
        .all() as Array<{ ticket_id: string; content: string; outdated: number }>;
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.ticket_id)) continue;
        seen.add(r.ticket_id);
        if (!r.outdated) {
          writePlan(ws.path, r.ticket_id, r.content);
        }
      }
    }

    // Migrate tasks
    if (tableNames.includes("tasks")) {
      const rows = sqlite
        .prepare("SELECT id, ticket_id, description, done, comment, outdated, status, error_message, result FROM tasks ORDER BY created_at ASC")
        .all() as Array<{
          id: string;
          ticket_id: string;
          description: string;
          done: number;
          comment: string | null;
          outdated: number;
          status: string | null;
          error_message: string | null;
          result: string | null;
        }>;
      const byTicket = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!byTicket.has(r.ticket_id)) byTicket.set(r.ticket_id, []);
        byTicket.get(r.ticket_id)!.push(r);
      }
      for (const [ticketId, taskRows] of byTicket) {
        const active = taskRows.filter((t) => !t.outdated);
        if (active.length > 0) {
          writeTasks(
            ws.path,
            ticketId,
            active.map((t) => ({
              id: t.id,
              description: t.description,
              done: Boolean(t.done),
              comment: t.comment ?? undefined,
              status: (t.status as any) ?? "queued",
              errorMessage: t.error_message ?? undefined,
              result: t.result ?? undefined,
            }))
          );
        }
      }
    }

    // Migrate implementations
    if (tableNames.includes("implementations")) {
      const rows = sqlite
        .prepare("SELECT ticket_id, content, outdated FROM implementations ORDER BY created_at DESC")
        .all() as Array<{ ticket_id: string; content: string; outdated: number }>;
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r.ticket_id)) continue;
        seen.add(r.ticket_id);
        if (!r.outdated) {
          writeImplement(ws.path, r.ticket_id, r.content);
        }
      }
    }

    // Migrate threads
    if (tableNames.includes("ticket_threads")) {
      const rows = sqlite
        .prepare("SELECT ticket_id, model_id, step, role, content, created_at FROM ticket_threads ORDER BY created_at ASC")
        .all() as Array<{
          ticket_id: string;
          model_id: string;
          step: string;
          role: string;
          content: string;
          created_at: string;
        }>;
      const byTicket = new Map<string, typeof rows>();
      for (const r of rows) {
        if (!byTicket.has(r.ticket_id)) byTicket.set(r.ticket_id, []);
        byTicket.get(r.ticket_id)!.push(r);
      }
      for (const [ticketId, threadRows] of byTicket) {
        appendThreadMessages(
          ws.path,
          ticketId,
          threadRows.map((r) => ({
            role: r.role as any,
            content: r.content,
            modelId: r.model_id,
            step: r.step as any,
            createdAt: r.created_at,
          }))
        );
      }
    }

    // Migrate archived status to filesystem
    if (hasArchivedAt) {
      const archivedRows = sqlite
        .prepare("SELECT id FROM tickets WHERE archived_at IS NOT NULL")
        .all() as Array<{ id: string }>;
      for (const r of archivedRows) {
        archiveTicket(ws.path, r.id);
      }
    }

    // Migrate ticket state / conf to files
    if (hasAutoApprove || hasErrorStep || hasErrorMessage) {
      const columnsToSelect = ["id"];
      if (hasAutoApprove) columnsToSelect.push("auto_approve");
      if (hasErrorStep) columnsToSelect.push("error_step");
      if (hasErrorMessage) columnsToSelect.push("error_message");
      const ticketRows = sqlite
        .prepare(`SELECT ${columnsToSelect.join(", ")} FROM tickets`)
        .all() as Array<{
          id: string;
          auto_approve?: string;
          error_step?: string | null;
          error_message?: string | null;
        }>;
      for (const r of ticketRows) {
        if (hasAutoApprove && r.auto_approve && r.auto_approve !== "{}") {
          try {
            const parsed = JSON.parse(r.auto_approve) as Record<string, boolean>;
            writeTicketConf(ws.path, r.id, { autoApprove: parsed });
          } catch {
            // ignore invalid json
          }
        }
        if ((hasErrorStep && r.error_step) || (hasErrorMessage && r.error_message)) {
          writeTicketState(ws.path, r.id, {
            errorStep: r.error_step ?? null,
            errorMessage: r.error_message ?? null,
          });
        }
      }
    }

    // Drop old tables and columns
    if (tableNames.includes("projects")) sqlite.exec("DROP TABLE IF EXISTS projects");
    if (tableNames.includes("step_model_overrides")) sqlite.exec("DROP TABLE IF EXISTS step_model_overrides");
    if (tableNames.includes("specs")) sqlite.exec("DROP TABLE IF EXISTS specs");
    if (tableNames.includes("plans")) sqlite.exec("DROP TABLE IF EXISTS plans");
    if (tableNames.includes("tasks")) sqlite.exec("DROP TABLE IF EXISTS tasks");
    if (tableNames.includes("implementations")) sqlite.exec("DROP TABLE IF EXISTS implementations");
    if (tableNames.includes("ticket_threads")) sqlite.exec("DROP TABLE IF EXISTS ticket_threads");
    if (hasArchivedAt) {
      sqlite.exec("ALTER TABLE tickets DROP COLUMN archived_at");
    }
    if (hasAutoApprove) {
      sqlite.exec("ALTER TABLE tickets DROP COLUMN auto_approve");
    }
    if (hasErrorStep) {
      sqlite.exec("ALTER TABLE tickets DROP COLUMN error_step");
    }
    if (hasErrorMessage) {
      sqlite.exec("ALTER TABLE tickets DROP COLUMN error_message");
    }

    sqlite.close();
  }
}
