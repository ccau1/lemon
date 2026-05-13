import type { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { eq, and, isNull } from "drizzle-orm";
import { tickets, actionRuns } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkflowEngine } from "../services/workflow.js";
import type { EventDispatcher } from "../services/event-dispatcher.js";
import {
  removeTicketArtifacts,
  archiveTicket,
  unarchiveTicket,
  deriveCurrentStep as deriveCurrentStepFromFiles,
  isTicketArchived,
  hasTicketArtifacts,
  readSpec,
  readPlan,
  readTasks,
  readImplement,
  readTicketState,
  readTicketConf,
  readOutdatedSteps,
  type TaskItem,
} from "../services/file-sync.js";

function readProjectNames(dataDir: string, workspaceId: string): Map<string, string> {
  const p = path.join(dataDir, "workspaces", workspaceId, "projects.json");
  if (!fs.existsSync(p)) return new Map();
  try {
    const list = JSON.parse(fs.readFileSync(p, "utf-8")) as Array<{ id: string; name: string }>;
    if (!Array.isArray(list)) return new Map();
    return new Map(list.map((proj) => [proj.id, proj.name]));
  } catch {
    return new Map();
  }
}

async function enrichTicket(
  db: DB,
  t: typeof tickets.$inferSelect,
  workspaceId: string,
  workspaceName: string,
  workspacePath: string | undefined,
  manager: ConfigManager,
  projectName?: string
) {
  // Step is the workflow position; state is the runtime state
  let columnStep = t.step;
  // If step claims "done" but tasks are still pending, we're actively implementing
  if (columnStep === "done" && workspacePath) {
    const tasks = readTasks(workspacePath, t.id);
    if (tasks && tasks.some((task) => task.status === "pending" || task.status === "queued" || task.status === "processing")) {
      columnStep = "implement";
    }
  }
  let effectiveStep = columnStep;
  if (effectiveStep === "implement" || effectiveStep === "done") {
    effectiveStep = "tasks";
  }
  const conf = workspacePath ? readTicketConf(workspacePath, t.id) : {};
  const ticketState = workspacePath ? readTicketState(workspacePath, t.id) : {};
  const resolved = manager.resolve(workspaceId);
  const effectiveAutoApprove = { ...resolved.autoApprove, ...(conf.autoApprove ?? {}) };
  const hasFiles = workspacePath ? hasTicketArtifacts(workspacePath, t.id) : false;
  const errors: Array<{ type: string; message: string; step?: string | null; taskId?: string }> = [];
  if (!hasFiles && !["spec", "plan", "tasks"].includes(t.step) && t.state !== "idle") {
    errors.push({ type: "missing_files", message: "Artifact files missing" });
  }
  if (ticketState.errorMessage) {
    errors.push({ type: "step", message: ticketState.errorMessage, step: ticketState.errorStep });
  }
  if (workspacePath) {
    const tasks = readTasks(workspacePath, t.id);
    if (tasks) {
      for (const task of tasks) {
        if (task.errorMessage) {
          errors.push({ type: "task", message: task.errorMessage, taskId: task.id });
        }
      }
    }
  }
  return { ...t, workspaceId, workspaceName, projectName, columnStep, effectiveStep, autoApprove: conf.autoApprove ?? {}, effectiveAutoApprove, errorMessage: ticketState.errorMessage, errorStep: ticketState.errorStep, hasFiles, errors };
}

export async function ticketRoutes(
  fastify: FastifyInstance,
  { getDb, registry, engine, dispatcher, dataDir, manager }: { getDb: (workspaceId: string) => DB; registry: WorkspaceRegistry; engine: WorkflowEngine; dispatcher?: EventDispatcher; dataDir: string; manager: ConfigManager }
) {
  fastify.get("/tickets", async (request) => {
    const { workspaceId, projectId, includeArchived } = request.query as {
      workspaceId?: string;
      projectId?: string;
      includeArchived?: string;
    };
    if (!workspaceId) return [];
    const db = getDb(workspaceId);
    const ws = registry.get(workspaceId);
    const showArchived = includeArchived === "true";
    const rows = projectId
      ? await db.select().from(tickets).where(eq(tickets.projectId, projectId))
      : await db.select().from(tickets);
    const filtered = showArchived
      ? rows
      : ws
        ? rows.filter((t) => !isTicketArchived(ws.path, t.id))
        : rows;
    const projectNames = readProjectNames(dataDir, workspaceId);
    const enriched = await Promise.all(
      filtered.map((t) => enrichTicket(db, t, workspaceId, ws?.name || workspaceId, ws?.path, manager, projectNames.get(t.projectId)))
    );
    return enriched;
  });

  fastify.post("/tickets", async (request, reply) => {
    const body = z.object({
      projectId: z.string(),
      title: z.string().min(1),
      description: z.string(),
      externalSource: z.string().optional(),
      externalSourceId: z.string().optional(),
    }).parse(request.body);
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(tickets).values({
      id,
      projectId: body.projectId,
      title: body.title,
      description: body.description,
      status: "pending",
      step: "spec",
      state: "idle",
      externalSource: body.externalSource,
      externalSourceId: body.externalSourceId,
      createdAt: now,
      updatedAt: now,
    });
    await dispatcher?.dispatch("ticketCreated", { workspaceId, ticketId: id, step: "spec" });
    engine.runTicket(workspaceId, id).catch(() => {});
    return { id, projectId: body.projectId, title: body.title, description: body.description, status: "pending", step: "spec", state: "idle", externalSource: body.externalSource, externalSourceId: body.externalSourceId, createdAt: now, updatedAt: now };
  });

  fastify.get("/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const row = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!row) return reply.status(404).send({ error: "Ticket not found" });
    return row;
  });

  fastify.get("/tickets/all", async (request) => {
    const { includeArchived } = request.query as { includeArchived?: string };
    const showArchived = includeArchived === "true";
    const allWorkspaces = registry.list();
    const allTickets: Array<Record<string, unknown>> = [];
    for (const ws of allWorkspaces) {
      const db = getDb(ws.id);
      const rows = await db.select().from(tickets);
      const filtered = showArchived ? rows : rows.filter((t) => !isTicketArchived(ws.path, t.id));
      const projectNames = readProjectNames(dataDir, ws.id);
      for (const t of filtered) {
        const enriched = await enrichTicket(db, t, ws.id, ws.name, ws.path, manager, projectNames.get(t.projectId));
        allTickets.push(enriched);
      }
    }
    return allTickets;
  });

  fastify.get("/tickets/:id/lmstate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const ws = registry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const state = readTicketState(ws.path, id);
    return { state };
  });

  fastify.get("/tickets/:id/details", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });
    const ws = registry.get(workspaceId);

    const spec = ws ? readSpec(ws.path, id) : null;
    const plan = ws ? readPlan(ws.path, id) : null;
    const taskList = ws ? readTasks(ws.path, id) : null;
    const implementation = ws ? readImplement(ws.path, id) : null;
    const outdatedSteps = ws ? readOutdatedSteps(ws.path, id) : [];

    const projectNames = readProjectNames(dataDir, workspaceId);
    const enriched = await enrichTicket(db, ticket, workspaceId, ws?.name || workspaceId, ws?.path, manager, projectNames.get(ticket.projectId));
    return {
      ticket: enriched,
      spec: spec ? { content: spec, outdated: outdatedSteps.includes("spec") } : null,
      plan: plan ? { content: plan, outdated: outdatedSteps.includes("plan") } : null,
      tasks: taskList ? taskList.map((t) => ({ ...t, outdated: outdatedSteps.includes("tasks") })) : [],
      implementation: implementation ? { content: implementation, outdated: outdatedSteps.includes("implement") } : null,
      _debugOutdatedSteps: outdatedSteps,
    };
  });

  fastify.post("/tickets/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const ws = registry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });
    if (ticket.step === "implement" || ticket.step === "done") {
      return reply.status(400).send({ error: "Cannot archive a ticket after the tasks step" });
    }
    const now = new Date().toISOString();
    await db.update(tickets).set({ updatedAt: now }).where(eq(tickets.id, id));
    archiveTicket(ws.path, id);
    return ticket;
  });

  fastify.post("/tickets/:id/unarchive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const ws = registry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.update(tickets).set({ updatedAt: now }).where(eq(tickets.id, id));
    unarchiveTicket(ws.path, id);
    const row = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!row) return reply.status(404).send({ error: "Ticket not found" });
    return row;
  });

  fastify.delete("/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const ws = registry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });
    if (ticket.step === "implement" || ticket.step === "done") {
      return reply.status(400).send({ error: "Cannot delete a ticket after the tasks step" });
    }
    await db.delete(actionRuns).where(eq(actionRuns.ticketId, id));
    await db.delete(tickets).where(eq(tickets.id, id));
    removeTicketArtifacts(ws.path, id);
    return { success: true };
  });

  fastify.post("/tickets/cleanup", async () => {
    const results: Array<{ workspaceId: string; deleted: string[]; kept: string[]; count: number }> = [];
    for (const ws of registry.list()) {
      const db = getDb(ws.id);
      const allTickets = await db.select().from(tickets);
      const deleted: string[] = [];
      const kept: string[] = [];
      for (const t of allTickets) {
        if (hasTicketArtifacts(ws.path, t.id)) {
          kept.push(t.id);
        } else {
          await db.delete(actionRuns).where(eq(actionRuns.ticketId, t.id));
          await db.delete(tickets).where(eq(tickets.id, t.id));
          deleted.push(t.id);
        }
      }
      results.push({ workspaceId: ws.id, deleted, kept, count: deleted.length });
    }
    return { results, totalDeleted: results.reduce((sum, r) => sum + r.count, 0) };
  });
}
