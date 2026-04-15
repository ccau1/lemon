import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets, specs, plans, tasks, implementations } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { LlmService } from "../services/llm.js";
import type { WorkflowEngine } from "../services/workflow.js";
import type { ConfigManager } from "../config/settings.js";
import type { BroadcastFn } from "../services/workflow.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import { syncTicketArtifact } from "../services/file-sync.js";
import type { WorkflowStep } from "@lemon/shared";

const chatSchema = z.object({
  step: z.enum(["spec", "plan", "tasks", "implement"]),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
});

const saveSpecSchema = z.object({ content: z.string() });
const savePlanSchema = z.object({ content: z.string() });
const saveTasksSchema = z.object({
  tasks: z.array(z.object({ description: z.string(), done: z.boolean() })),
});
const saveImplSchema = z.object({ content: z.string() });

const stepOrder: WorkflowStep[] = ["spec", "plan", "tasks", "implement", "done"];

function nextStep(current: WorkflowStep): WorkflowStep {
  const idx = stepOrder.indexOf(current);
  return stepOrder[Math.min(idx + 1, stepOrder.length - 1)];
}

function prevStep(current: WorkflowStep): WorkflowStep {
  const idx = stepOrder.indexOf(current);
  return stepOrder[Math.max(idx - 1, 0)];
}

export async function workflowRoutes(
  fastify: FastifyInstance,
  {
    getDb,
    llm,
    engine,
    configManager,
    broadcast,
    workspaceRegistry,
  }: { getDb: (workspaceId: string) => DB; llm: LlmService; engine: WorkflowEngine; configManager: ConfigManager; broadcast: BroadcastFn; workspaceRegistry: WorkspaceRegistry }
) {
  fastify.post("/tickets/:id/chat", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = chatSchema.parse(request.body);

    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    const model = await llm.resolveModel(workspaceId, ticket.projectId, body.step, db);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });

    const content = await llm.chat(model, body.messages);
    return { content, model: model.name };
  });

  fastify.post("/tickets/:id/spec", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveSpecSchema.parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.delete(specs).where(eq(specs.ticketId, id));
    await db.insert(specs).values({ id: crypto.randomUUID(), ticketId: id, content: body.content, createdAt: now, updatedAt: now });
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "spec" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) syncTicketArtifact(ws.path, id, "spec", body.content);
    return { success: true };
  });

  fastify.post("/tickets/:id/plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = savePlanSchema.parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.delete(plans).where(eq(plans.ticketId, id));
    await db.insert(plans).values({ id: crypto.randomUUID(), ticketId: id, content: body.content, createdAt: now, updatedAt: now });
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "plan" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) syncTicketArtifact(ws.path, id, "plan", body.content);
    return { success: true };
  });

  fastify.post("/tickets/:id/tasks", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveTasksSchema.parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.delete(tasks).where(eq(tasks.ticketId, id));
    for (const t of body.tasks) {
      await db.insert(tasks).values({ id: crypto.randomUUID(), ticketId: id, description: t.description, done: t.done, createdAt: now, updatedAt: now });
    }
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "tasks" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) syncTicketArtifact(ws.path, id, "tasks", body.tasks);
    return { success: true };
  });

  fastify.post("/tickets/:id/implement", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveImplSchema.parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.delete(implementations).where(eq(implementations.ticketId, id));
    await db.insert(implementations).values({ id: crypto.randomUUID(), ticketId: id, content: body.content, createdAt: now, updatedAt: now });
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "implement" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) syncTicketArtifact(ws.path, id, "implement", body.content);
    return { success: true };
  });

  fastify.post("/tickets/:id/advance", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    let completedStep: WorkflowStep = ticket.status as WorkflowStep;
    if (ticket.status === "awaiting_review" || ticket.status === "queued") {
      const [specRows, planRows, taskRows, implRows] = await Promise.all([
        db.select().from(specs).where(eq(specs.ticketId, id)),
        db.select().from(plans).where(eq(plans.ticketId, id)),
        db.select().from(tasks).where(eq(tasks.ticketId, id)),
        db.select().from(implementations).where(eq(implementations.ticketId, id)),
      ]);
      if (implRows.length) completedStep = "implement";
      else if (taskRows.length) completedStep = "tasks";
      else if (planRows.length) completedStep = "plan";
      else if (specRows.length) completedStep = "spec";
      else completedStep = "spec";
    }

    const newStatus = nextStep(completedStep);
    await db.update(tickets).set({ status: newStatus, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));

    broadcast("ticket:advanced", { workspaceId, ticketId: id, newStatus });

    if (newStatus !== "done") {
      engine.runTicket(workspaceId, id).catch(() => {});
    }

    return { success: true, newStatus };
  });

  fastify.post("/tickets/:id/back", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    let currentStep: WorkflowStep = ticket.status as WorkflowStep;
    if (ticket.status === "awaiting_review" || ticket.status === "queued") {
      const [specRows, planRows, taskRows, implRows] = await Promise.all([
        db.select().from(specs).where(eq(specs.ticketId, id)),
        db.select().from(plans).where(eq(plans.ticketId, id)),
        db.select().from(tasks).where(eq(tasks.ticketId, id)),
        db.select().from(implementations).where(eq(implementations.ticketId, id)),
      ]);
      if (implRows.length) currentStep = "implement";
      else if (taskRows.length) currentStep = "tasks";
      else if (planRows.length) currentStep = "plan";
      else if (specRows.length) currentStep = "spec";
      else currentStep = "spec";
    }

    const newStatus = prevStep(currentStep);

    if (newStatus === "spec") {
      await db.delete(plans).where(eq(plans.ticketId, id));
      await db.delete(tasks).where(eq(tasks.ticketId, id));
      await db.delete(implementations).where(eq(implementations.ticketId, id));
    } else if (newStatus === "plan") {
      await db.delete(tasks).where(eq(tasks.ticketId, id));
      await db.delete(implementations).where(eq(implementations.ticketId, id));
    } else if (newStatus === "tasks") {
      await db.delete(implementations).where(eq(implementations.ticketId, id));
    }

    await db.update(tickets).set({ status: newStatus, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:back", { workspaceId, ticketId: id, newStatus });

    return { success: true, newStatus };
  });

  fastify.post("/tickets/:id/queue", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    await engine.queueTicket(workspaceId, id);
    return { success: true };
  });

  fastify.post("/tickets/:id/reset", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    await db.update(tickets).set({ status: "spec", updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, newStatus: "spec" });
    return { success: true };
  });

  fastify.post("/tickets/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    await engine.runTicket(workspaceId, id);
    return { success: true };
  });

  fastify.post("/tickets/run", async (request, reply) => {
    const { workspaceId, parallel, allWorkspaces } = z
      .object({
        workspaceId: z.string(),
        parallel: z.boolean().default(true),
        allWorkspaces: z.boolean().default(false),
      })
      .parse(request.body);
    await engine.runQueued(workspaceId, allWorkspaces);
    return { success: true };
  });
}
