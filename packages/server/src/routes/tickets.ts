import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { tickets, actionRuns } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { WorkflowEngine } from "../services/workflow.js";
import type { EventDispatcher } from "../services/event-dispatcher.js";
import {
  removeTicketArtifacts,
  archiveTicket,
  unarchiveTicket,
  deriveCurrentStep as deriveCurrentStepFromFiles,
  isTicketArchived,
  readSpec,
  readPlan,
  readTasks,
  readImplement,
  readTicketState,
  readTicketConf,
} from "../services/file-sync.js";

async function enrichTicket(
  db: DB,
  t: typeof tickets.$inferSelect,
  workspaceId: string,
  workspaceName: string,
  workspacePath: string | undefined
) {
  let effectiveStep = t.status;
  if (t.status === "awaiting_review" || t.status === "queued" || t.status === "running" || t.status === "error") {
    if (t.status === "error") {
      const state = workspacePath ? readTicketState(workspacePath, t.id) : {};
      effectiveStep = state.errorStep ?? (workspacePath ? deriveCurrentStepFromFiles(workspacePath, t.id) : "spec");
    } else if (workspacePath) {
      effectiveStep = deriveCurrentStepFromFiles(workspacePath, t.id);
    }
  }
  if (effectiveStep === "implement" || effectiveStep === "done") {
    effectiveStep = "tasks";
  }
  const conf = workspacePath ? readTicketConf(workspacePath, t.id) : {};
  return { ...t, workspaceId, workspaceName, effectiveStep, autoApprove: conf.autoApprove ?? {} };
}

export async function ticketRoutes(
  fastify: FastifyInstance,
  { getDb, registry, engine, dispatcher }: { getDb: (workspaceId: string) => DB; registry: WorkspaceRegistry; engine: WorkflowEngine; dispatcher?: EventDispatcher }
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
    const enriched = await Promise.all(
      filtered.map((t) => enrichTicket(db, t, workspaceId, ws?.name || workspaceId, ws?.path))
    );
    return enriched;
  });

  fastify.post("/tickets", async (request, reply) => {
    const body = z.object({
      projectId: z.string(),
      title: z.string().min(1),
      description: z.string(),
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
      status: "spec",
      createdAt: now,
      updatedAt: now,
    });
    await dispatcher?.dispatch("ticketCreated", { workspaceId, ticketId: id, step: "spec" });
    engine.runTicket(workspaceId, id).catch(() => {});
    return { id, projectId: body.projectId, title: body.title, description: body.description, status: "spec", createdAt: now, updatedAt: now };
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
      for (const t of filtered) {
        const enriched = await enrichTicket(db, t, ws.id, ws.name, ws.path);
        allTickets.push(enriched);
      }
    }
    return allTickets;
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

    let effectiveStep = ticket.status;
    if (ticket.status === "awaiting_review" || ticket.status === "queued" || ticket.status === "running" || ticket.status === "error") {
      if (ticket.status === "error") {
        const state = ws ? readTicketState(ws.path, id) : {};
        effectiveStep = state.errorStep ?? (ws ? deriveCurrentStepFromFiles(ws.path, id) : "spec");
      } else if (ws) {
        effectiveStep = deriveCurrentStepFromFiles(ws.path, id);
      }
    }
    if (effectiveStep === "implement" || effectiveStep === "done") {
      effectiveStep = "tasks";
    }

    const conf = ws ? readTicketConf(ws.path, id) : {};
    return {
      ticket: { ...ticket, effectiveStep, autoApprove: conf.autoApprove ?? {} },
      spec: spec ? { content: spec } : null,
      plan: plan ? { content: plan } : null,
      tasks: taskList ?? [],
      implementation: implementation ? { content: implementation } : null,
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
    if (ticket.status === "implement" || ticket.status === "done") {
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
    if (ticket.status === "implement" || ticket.status === "done") {
      return reply.status(400).send({ error: "Cannot delete a ticket after the tasks step" });
    }
    await db.delete(actionRuns).where(eq(actionRuns.ticketId, id));
    await db.delete(tickets).where(eq(tickets.id, id));
    removeTicketArtifacts(ws.path, id);
    return { success: true };
  });
}
