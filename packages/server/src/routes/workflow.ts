import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { tickets, specs, plans, tasks, implementations } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { LlmService } from "../services/llm.js";
import type { WorkflowEngine } from "../services/workflow.js";
import type { ConfigManager } from "../config/settings.js";
import type { BroadcastFn } from "../services/workflow.js";
import { stripPreamble } from "../services/workflow.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import { syncTicketArtifact } from "../services/file-sync.js";
import type { WorkflowStep } from "@lemon/shared";
import { getThreadMessages, appendThreadMessages, type ThreadMessage } from "../services/thread.js";

const chatSchema = z.object({
  step: z.enum(["spec", "plan", "tasks", "implement"]),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  revise: z.boolean().optional().default(false),
});

const chatSectionSchema = z.object({
  step: z.enum(["spec", "plan", "tasks", "implement"]),
  fullContent: z.string(),
  sectionContent: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
});

const chatTaskSchema = z.object({
  taskId: z.string(),
  taskDescription: z.string(),
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
  tasks: z.array(z.object({
    description: z.string(),
    done: z.boolean(),
    comment: z.string().optional(),
    status: z.enum(["queued", "processing", "done", "cancelled", "error"]).optional(),
    errorMessage: z.string().optional(),
    result: z.string().optional(),
  })),
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

async function markDownstreamOutdated(db: DB, ticketId: string, step: WorkflowStep) {
  if (step === "spec") {
    await db.update(plans).set({ outdated: true }).where(eq(plans.ticketId, ticketId));
    await db.update(tasks).set({ outdated: true }).where(eq(tasks.ticketId, ticketId));
    await db.update(implementations).set({ outdated: true }).where(eq(implementations.ticketId, ticketId));
  } else if (step === "plan") {
    await db.update(tasks).set({ outdated: true }).where(eq(tasks.ticketId, ticketId));
    await db.update(implementations).set({ outdated: true }).where(eq(implementations.ticketId, ticketId));
  } else if (step === "tasks") {
    await db.update(implementations).set({ outdated: true }).where(eq(implementations.ticketId, ticketId));
  }
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
  fastify.patch("/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = z.object({ title: z.string().min(1).optional(), description: z.string().optional() }).parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.update(tickets).set({ ...body, updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id });
    return { success: true };
  });

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

    const threadMessages = await getThreadMessages(db, id, model.id);
    let newMessages: ThreadMessage[] = body.messages.map((m) => ({ role: m.role as ThreadMessage["role"], content: m.content }));

    if (body.revise && (body.step === "spec" || body.step === "plan")) {
      let currentContent = "";
      if (body.step === "spec") {
        const rows = await db.select().from(specs).where(eq(specs.ticketId, id)).orderBy(desc(specs.createdAt)).limit(1);
        currentContent = rows[0]?.content || "";
      } else if (body.step === "plan") {
        const rows = await db.select().from(plans).where(eq(plans.ticketId, id)).orderBy(desc(plans.createdAt)).limit(1);
        currentContent = rows[0]?.content || "";
      }
      const basePrompt = configManager.resolve(workspaceId).prompts[body.step]?.trim()
        || (body.step === "spec"
          ? "You are an expert product manager. Write a clear, concise product spec in markdown."
          : "You are a senior software architect. Write a high-level implementation plan in markdown.");
      const prompt = currentContent
        ? `${basePrompt}\n\nHere is the current ${body.step}:\n\n${currentContent}\n\nRevise it based on the following comment. Output only the complete revised ${body.step} in markdown.`
        : `${basePrompt}\n\nPlease write a ${body.step} based on the following comment. Output only the markdown.`;

      // Merge instruction into the last user message so CLI providers weight it properly
      const last = newMessages[newMessages.length - 1];
      if (last && last.role === "user") {
        newMessages = [
          ...newMessages.slice(0, -1),
          { role: "user", content: `${prompt}\n\nComment: ${last.content}` },
        ];
      } else {
        newMessages = [...newMessages, { role: "user", content: prompt }];
      }
    }

    const allMessages: ThreadMessage[] = [...threadMessages, ...newMessages];
    let content = await llm.chat(model, allMessages);
    content = stripPreamble(content);

    await appendThreadMessages(db, id, model.id, body.step, [
      ...newMessages,
      { role: "assistant", content },
    ]);

    if (body.revise && (body.step === "spec" || body.step === "plan")) {
      const now = new Date().toISOString();
      if (body.step === "spec") {
        await db.insert(specs).values({ id: crypto.randomUUID(), ticketId: id, content, createdAt: now, updatedAt: now });
        await markDownstreamOutdated(db, id, "spec");
      } else if (body.step === "plan") {
        await db.insert(plans).values({ id: crypto.randomUUID(), ticketId: id, content, createdAt: now, updatedAt: now });
        await markDownstreamOutdated(db, id, "plan");
      }
      await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: body.step, newStatus: "awaiting_review" });
      engine.runTicket(workspaceId, id).catch(() => {});
      const ws = workspaceRegistry.get(workspaceId);
      if (ws) syncTicketArtifact(ws.path, id, body.step, content);
    }

    const updatedThread = await getThreadMessages(db, id, model.id);
    return { content, model: model.name, thread: updatedThread };
  });

  fastify.post("/tickets/:id/chat-section", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = chatSectionSchema.parse(request.body);

    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    const model = await llm.resolveModel(workspaceId, ticket.projectId, body.step, db);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });

    const threadMessages = await getThreadMessages(db, id, model.id);
    const newMessages: ThreadMessage[] = [
      {
        role: "system",
        content:
          "You are editing one section of a larger markdown document. " +
          "Respond with ONLY the updated markdown for the given section. " +
          "Do not add explanations or wrap the response in conversational text.",
      },
      {
        role: "user",
        content: "Here is the section to edit:\n\n" + body.sectionContent,
      },
      ...body.messages.map((m) => ({ role: m.role as ThreadMessage["role"], content: m.content })),
    ];
    const allMessages: ThreadMessage[] = [...threadMessages, ...newMessages];

    let sectionResponse = await llm.chat(model, allMessages);
    sectionResponse = stripPreamble(sectionResponse);

    // Strip optional outer markdown fences
    const fenced = sectionResponse.match(/^```(?:markdown)?\n?([\s\S]*?)```$/);
    if (fenced) {
      sectionResponse = fenced[1].trim();
    }

    await appendThreadMessages(db, id, model.id, body.step, [
      ...newMessages,
      { role: "assistant", content: sectionResponse },
    ]);

    const index = body.fullContent.indexOf(body.sectionContent);
    if (index === -1) {
      return reply.status(400).send({ error: "Section not found in full content" });
    }
    const newContent =
      body.fullContent.slice(0, index) + sectionResponse + body.fullContent.slice(index + body.sectionContent.length);

    const now = new Date().toISOString();
    const ws = workspaceRegistry.get(workspaceId);

    if (body.step === "spec") {
      await db.insert(specs).values({ id: crypto.randomUUID(), ticketId: id, content: newContent, createdAt: now, updatedAt: now });
      await markDownstreamOutdated(db, id, "spec");
      await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: "spec", newStatus: "awaiting_review" });
      engine.runTicket(workspaceId, id).catch(() => {});
      if (ws) syncTicketArtifact(ws.path, id, "spec", newContent);
    } else if (body.step === "plan") {
      await db.insert(plans).values({ id: crypto.randomUUID(), ticketId: id, content: newContent, createdAt: now, updatedAt: now });
      await markDownstreamOutdated(db, id, "plan");
      await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: "plan", newStatus: "awaiting_review" });
      engine.runTicket(workspaceId, id).catch(() => {});
      if (ws) syncTicketArtifact(ws.path, id, "plan", newContent);
    } else if (body.step === "implement") {
      await db.delete(implementations).where(eq(implementations.ticketId, id));
      await db.insert(implementations).values({ id: crypto.randomUUID(), ticketId: id, content: newContent, createdAt: now, updatedAt: now });
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: "implement" });
      if (ws) syncTicketArtifact(ws.path, id, "implement", newContent);
    } else {
      return reply.status(400).send({ error: "Section chat not supported for tasks step" });
    }

    const updatedThread = await getThreadMessages(db, id, model.id);
    return { content: newContent, model: model.name, thread: updatedThread };
  });

  fastify.post("/tickets/:id/chat-task", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = chatTaskSchema.parse(request.body);

    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    const model = await llm.resolveModel(workspaceId, ticket.projectId, "tasks", db);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });

    const threadMessages = await getThreadMessages(db, id, model.id);
    const newMessages: ThreadMessage[] = [
      {
        role: "system",
        content:
          "You are editing a single task description. " +
          "Respond with ONLY the updated task description. " +
          "Do not add explanations or wrap the response in conversational text.",
      },
      {
        role: "user",
        content: "Here is the task to edit:\n\n" + body.taskDescription,
      },
      ...body.messages.map((m) => ({ role: m.role as ThreadMessage["role"], content: m.content })),
    ];
    const allMessages: ThreadMessage[] = [...threadMessages, ...newMessages];

    let taskResponse = await llm.chat(model, allMessages);

    // Strip optional outer markdown fences
    const fenced = taskResponse.match(/^```(?:markdown)?\n?([\s\S]*?)```$/);
    if (fenced) {
      taskResponse = fenced[1].trim();
    }

    // Strip common reasoning/thinking tags and their contents
    taskResponse = taskResponse.replace(/<think[\s\S]*?<\/think>/g, "").replace(/<thinking[\s\S]*?<\/thinking>/g, "").trim();
    // Strip leading bullet characters
    taskResponse = taskResponse.replace(/^[\s]*[\-\*•][\s]+/, "").trim();

    await appendThreadMessages(db, id, model.id, "tasks", [
      ...newMessages,
      { role: "assistant", content: taskResponse },
    ]);

    const allTasks = await db.select().from(tasks).where(eq(tasks.ticketId, id));
    const targetTask = allTasks.find((t) => t.id === body.taskId);
    if (!targetTask) return reply.status(404).send({ error: "Task not found" });

    const now = new Date().toISOString();
    await db.delete(tasks).where(eq(tasks.ticketId, id));
    for (const t of allTasks) {
      const description = t.id === body.taskId ? taskResponse : t.description;
      await db.insert(tasks).values({
        id: crypto.randomUUID(),
        ticketId: id,
        description,
        done: t.done,
        comment: t.comment,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "tasks", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
    const ws = workspaceRegistry.get(workspaceId);
    const taskList = allTasks.map((t) => ({
      description: t.id === body.taskId ? taskResponse : t.description,
      done: t.done,
      comment: t.comment,
    }));
    if (ws) syncTicketArtifact(ws.path, id, "tasks", taskList);

    const updatedThread = await getThreadMessages(db, id, model.id);
    return { content: taskResponse, model: model.name, thread: updatedThread };
  });

  fastify.get("/tickets/:id/thread", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId, step } = request.query as { workspaceId?: string; step?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (!step || !["spec", "plan", "tasks", "implement"].includes(step)) {
      return reply.status(400).send({ error: "valid step query param required" });
    }
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });
    const model = await llm.resolveModel(workspaceId, ticket.projectId, step as WorkflowStep, db);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });
    const thread = await getThreadMessages(db, id, model.id);
    return { modelId: model.id, thread };
  });

  fastify.post("/tickets/:id/spec", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveSpecSchema.parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.insert(specs).values({ id: crypto.randomUUID(), ticketId: id, content: body.content, createdAt: now, updatedAt: now });
    await markDownstreamOutdated(db, id, "spec");
    await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "spec", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
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
    await db.insert(plans).values({ id: crypto.randomUUID(), ticketId: id, content: body.content, createdAt: now, updatedAt: now });
    await markDownstreamOutdated(db, id, "plan");
    await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "plan", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
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
      await db.insert(tasks).values({
        id: crypto.randomUUID(),
        ticketId: id,
        description: t.description,
        done: t.done,
        comment: t.comment,
        status: t.status ?? "queued",
        errorMessage: t.errorMessage,
        result: t.result,
        createdAt: now,
        updatedAt: now,
      });
    }
    await markDownstreamOutdated(db, id, "tasks");
    await db.update(tickets).set({ status: "awaiting_review", errorStep: null, errorMessage: null, updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "tasks", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
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

    let completedStep: WorkflowStep;
    if (ticket.status === "error" && ticket.errorStep) {
      completedStep = ticket.errorStep as WorkflowStep;
    } else if (ticket.status === "awaiting_review" || ticket.status === "queued") {
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
    } else {
      completedStep = ticket.status as WorkflowStep;
    }

    const newStatus = nextStep(completedStep);
    await db.update(tickets).set({ status: newStatus, errorStep: null, errorMessage: null, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));

    broadcast("ticket:advanced", { workspaceId, ticketId: id, newStatus });

    if (newStatus !== "done") {
      engine.runTicket(workspaceId, id).catch(() => {});
    }

    return { success: true, newStatus };
  });

  fastify.post("/tickets/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    let completedStep: WorkflowStep;
    if (ticket.status === "error" && ticket.errorStep) {
      completedStep = ticket.errorStep as WorkflowStep;
    } else if (ticket.status === "awaiting_review" || ticket.status === "queued") {
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
    } else {
      completedStep = ticket.status as WorkflowStep;
    }

    const newStatus = nextStep(completedStep);
    await db.update(tickets).set({ status: newStatus, errorStep: null, errorMessage: null, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));

    broadcast("ticket:approved", { workspaceId, ticketId: id, newStatus });

    if (newStatus !== "done") {
      engine.runTicket(workspaceId, id).catch(() => {});
    }

    return { success: true, newStatus };
  });

  fastify.post("/tickets/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    let currentStep: WorkflowStep;
    if (ticket.status === "error" && ticket.errorStep) {
      currentStep = ticket.errorStep as WorkflowStep;
    } else if (ticket.status === "awaiting_review" || ticket.status === "queued") {
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
    } else {
      currentStep = ticket.status as WorkflowStep;
    }

    await db.update(tickets).set({ status: currentStep, errorStep: null, errorMessage: null, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:rejected", { workspaceId, ticketId: id, step: currentStep });

    return { success: true };
  });

  fastify.post("/tickets/:id/back", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });

    let currentStep: WorkflowStep;
    if (ticket.status === "error" && ticket.errorStep) {
      currentStep = ticket.errorStep as WorkflowStep;
    } else if (ticket.status === "awaiting_review" || ticket.status === "queued") {
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
    } else {
      currentStep = ticket.status as WorkflowStep;
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

    await db.update(tickets).set({ status: newStatus, errorStep: null, errorMessage: null, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
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
