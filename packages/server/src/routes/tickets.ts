import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, specs, plans, tasks, implementations } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";

const createSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string(),
});

async function enrichTicket(
  db: DB,
  t: typeof tickets.$inferSelect,
  workspaceId: string,
  workspaceName: string
) {
  let effectiveStep = t.status;
  if (t.status === "awaiting_review" || t.status === "queued" || t.status === "error") {
    const [specRows, planRows, taskRows, implRows] = await Promise.all([
      db.select().from(specs).where(eq(specs.ticketId, t.id)),
      db.select().from(plans).where(eq(plans.ticketId, t.id)),
      db.select().from(tasks).where(eq(tasks.ticketId, t.id)),
      db.select().from(implementations).where(eq(implementations.ticketId, t.id)),
    ]);
    if (implRows.length) effectiveStep = "done";
    else if (taskRows.length) effectiveStep = "implement";
    else if (planRows.length) effectiveStep = "tasks";
    else if (specRows.length) effectiveStep = "plan";
    else effectiveStep = "spec";
  }
  return { ...t, workspaceId, workspaceName, effectiveStep };
}

export async function ticketRoutes(
  fastify: FastifyInstance,
  { getDb, registry }: { getDb: (workspaceId: string) => DB; registry: WorkspaceRegistry }
) {
  fastify.get("/tickets", async (request) => {
    const { workspaceId, projectId } = request.query as {
      workspaceId?: string;
      projectId?: string;
    };
    if (!workspaceId) return [];
    const db = getDb(workspaceId);
    const ws = registry.get(workspaceId);
    const rows = projectId
      ? await db.select().from(tickets).where(eq(tickets.projectId, projectId))
      : await db.select().from(tickets);
    const enriched = await Promise.all(
      rows.map((t) => enrichTicket(db, t, workspaceId, ws?.name || workspaceId))
    );
    return enriched;
  });

  fastify.post("/tickets", async (request, reply) => {
    const body = createSchema.parse(request.body);
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

  fastify.get("/tickets/all", async () => {
    const allWorkspaces = registry.list();
    const allTickets: Array<Record<string, unknown>> = [];
    for (const ws of allWorkspaces) {
      const db = getDb(ws.id);
      const rows = await db.select().from(tickets);
      for (const t of rows) {
        const enriched = await enrichTicket(db, t, ws.id, ws.name);
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

    const [specRows, planRows, taskRows, implRows] = await Promise.all([
      db.select().from(specs).where(eq(specs.ticketId, id)),
      db.select().from(plans).where(eq(plans.ticketId, id)),
      db.select().from(tasks).where(eq(tasks.ticketId, id)),
      db.select().from(implementations).where(eq(implementations.ticketId, id)),
    ]);

    return {
      ticket,
      spec: specRows[0] ?? null,
      plan: planRows[0] ?? null,
      tasks: taskRows,
      implementation: implRows[0] ?? null,
    };
  });
}
