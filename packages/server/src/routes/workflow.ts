import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { tickets, eventActionLinkages } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { LlmService } from "../services/llm.js";
import type { WorkflowEngine } from "../services/workflow.js";
import type { ConfigManager } from "../config/settings.js";
import type { BroadcastFn } from "../services/workflow.js";
import type { EventDispatcher } from "../services/event-dispatcher.js";
import { stripPreamble, parseQuestion, assertValidContent } from "../services/workflow.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { WorkflowStep } from "@lemon/shared";
import { getThreadMessages, appendThreadMessages, type ThreadMessage } from "../services/thread.js";
import {
  readSpec,
  writeSpec,
  readPlan,
  writePlan,
  readTasks,
  writeTasks,
  readImplement,
  writeImplement,
  isTicketArchived,
  deriveCurrentStep as deriveCurrentStepFromFiles,
  clearDownstreamArtifacts,
  readTicketState,
  writeTicketState,
  readTicketConf,
  writeTicketConf,
} from "../services/file-sync.js";

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

export async function workflowRoutes(
  fastify: FastifyInstance,
  {
    getDb,
    llm,
    engine,
    configManager,
    broadcast,
    workspaceRegistry,
    dispatcher,
  }: { getDb: (workspaceId: string) => DB; llm: LlmService; engine: WorkflowEngine; configManager: ConfigManager; broadcast: BroadcastFn; workspaceRegistry: WorkspaceRegistry; dispatcher?: EventDispatcher }
) {
  function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function checkArchived(ticketId: string): boolean {
    for (const ws of workspaceRegistry.list()) {
      if (isTicketArchived(ws.path, ticketId)) return true;
    }
    return false;
  }

  fastify.patch("/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      autoApprove: z.record(z.enum(["spec", "plan", "tasks", "implement", "done"]), z.boolean()).optional(),
      triggers: z.record(z.string(), z.array(z.string())).optional(),
    }).parse(request.body);
    const db = getDb(workspaceId);
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws && (body.autoApprove !== undefined || body.triggers !== undefined)) {
      const conf = readTicketConf(ws.path, id);
      writeTicketConf(ws.path, id, {
        ...conf,
        ...(body.autoApprove !== undefined ? { autoApprove: body.autoApprove } : {}),
        ...(body.triggers !== undefined ? { triggers: body.triggers } : {}),
      });
    }
    const now = new Date().toISOString();
    const update: any = { title: body.title, description: body.description, updatedAt: now };
    await db.update(tickets).set(update).where(eq(tickets.id, id));
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
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const model = await llm.resolveModel(workspaceId, ticket.projectId, body.step);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });

    const ws = workspaceRegistry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });

    const threadMessages = await getThreadMessages(ws.path, id, model.id, body.step);
    let newMessages: ThreadMessage[] = body.messages.map((m) => ({ role: m.role as ThreadMessage["role"], content: m.content }));

    if (body.revise && (body.step === "spec" || body.step === "plan")) {
      let currentContent = "";
      if (body.step === "spec") {
        currentContent = readSpec(ws.path, id) || "";
      } else if (body.step === "plan") {
        currentContent = readPlan(ws.path, id) || "";
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
    const chatResult = await llm.chat(model, allMessages, ws.path);
    let content = chatResult.content;
    void chatResult.durationMs;
    content = stripPreamble(content);

    const question = parseQuestion(content);
    if (question && (body.step === "spec" || body.step === "plan")) {
      await appendThreadMessages(ws.path, id, [
        ...newMessages.map((m) => ({ ...m, modelId: model.id, step: body.step })),
        { role: "assistant", content: `QUESTION: ${question}`, modelId: model.id, step: body.step },
      ]);
      const updatedThread = await getThreadMessages(ws.path, id, model.id, body.step);
      return { content: `QUESTION: ${question}`, model: model.name, thread: updatedThread };
    }

    assertValidContent(body.step, content);

    await appendThreadMessages(ws.path, id, [
      ...newMessages.map((m) => ({ ...m, modelId: model.id, step: body.step })),
      { role: "assistant", content, modelId: model.id, step: body.step },
    ]);

    if (body.revise && (body.step === "spec" || body.step === "plan")) {
      const now = new Date().toISOString();
      if (body.step === "spec") {
        writeSpec(ws.path, id, content);
        clearDownstreamArtifacts(ws.path, id, "spec");
      } else if (body.step === "plan") {
        writePlan(ws.path, id, content);
        clearDownstreamArtifacts(ws.path, id, "plan");
      }
      if (ws) writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
      await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: body.step, newStatus: "awaiting_review" });
      engine.runTicket(workspaceId, id).catch(() => {});
    }

    const updatedThread = await getThreadMessages(ws.path, id, model.id, body.step);
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
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const model = await llm.resolveModel(workspaceId, ticket.projectId, body.step);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });

    const ws = workspaceRegistry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });

    const threadMessages = await getThreadMessages(ws.path, id, model.id, body.step);
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
    const sectionChatResult = await llm.chat(model, allMessages, ws.path);
    let sectionResponse = sectionChatResult.content;
    void sectionChatResult.durationMs;

    // Strip optional outer markdown fences
    const fenced = sectionResponse.match(/^```(?:markdown)?\n?([\s\S]*?)```$/);
    if (fenced) {
      sectionResponse = fenced[1].trim();
    }

    await appendThreadMessages(ws.path, id, [
      ...newMessages.map((m) => ({ ...m, modelId: model.id, step: body.step })),
      { role: "assistant", content: sectionResponse, modelId: model.id, step: body.step },
    ]);

    const index = body.fullContent.indexOf(body.sectionContent);
    if (index === -1) {
      return reply.status(400).send({ error: "Section not found in full content" });
    }
    const newContent =
      body.fullContent.slice(0, index) + sectionResponse + body.fullContent.slice(index + body.sectionContent.length);

    const now = new Date().toISOString();

    if (body.step === "spec") {
      writeSpec(ws.path, id, newContent);
      clearDownstreamArtifacts(ws.path, id, "spec");
      if (ws) writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
      await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: "spec", newStatus: "awaiting_review" });
      engine.runTicket(workspaceId, id).catch(() => {});
    } else if (body.step === "plan") {
      writePlan(ws.path, id, newContent);
      clearDownstreamArtifacts(ws.path, id, "plan");
      if (ws) writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
      await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: "plan", newStatus: "awaiting_review" });
      engine.runTicket(workspaceId, id).catch(() => {});
    } else if (body.step === "implement") {
      writeImplement(ws.path, id, newContent);
      broadcast("ticket:updated", { workspaceId, ticketId: id, step: "implement" });
    } else {
      return reply.status(400).send({ error: "Section chat not supported for tasks step" });
    }

    const updatedThread = await getThreadMessages(ws.path, id, model.id, body.step);
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
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const model = await llm.resolveModel(workspaceId, ticket.projectId, "tasks");
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });

    const ws = workspaceRegistry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });

    const threadMessages = await getThreadMessages(ws.path, id, model.id, "tasks");
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
    const taskChatResult = await llm.chat(model, allMessages, ws.path);
    let taskResponse = taskChatResult.content;
    void taskChatResult.durationMs;

    // Strip optional outer markdown fences
    const fenced = taskResponse.match(/^```(?:markdown)?\n?([\s\S]*?)```$/);
    if (fenced) {
      taskResponse = fenced[1].trim();
    }

    // Strip common reasoning/thinking tags and their contents
    taskResponse = taskResponse.replace(/<think[\s\S]*?<\/think>/g, "").replace(/<thinking[\s\S]*?<\/thinking>/g, "").trim();
    // Strip leading bullet characters
    taskResponse = taskResponse.replace(/^[\s]*[\-\*•][\s]+/, "").trim();

    await appendThreadMessages(ws.path, id, [
      ...newMessages.map((m) => ({ ...m, modelId: model.id, step: "tasks" as WorkflowStep })),
      { role: "assistant", content: taskResponse, modelId: model.id, step: "tasks" },
    ]);

    const allTasks = readTasks(ws.path, id) ?? [];
    const targetIndex = allTasks.findIndex((t) => t.id === body.taskId);
    if (targetIndex === -1) return reply.status(404).send({ error: "Task not found" });

    const now = new Date().toISOString();
    allTasks[targetIndex] = { ...allTasks[targetIndex], description: taskResponse };
    writeTasks(ws.path, id, allTasks);

    if (ws) writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "tasks", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});

    const updatedThread = await getThreadMessages(ws.path, id, model.id, "tasks");
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
    const model = await llm.resolveModel(workspaceId, ticket.projectId, step as WorkflowStep);
    if (!model) return reply.status(400).send({ error: "No model resolved for step" });
    const ws = workspaceRegistry.get(workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const thread = await getThreadMessages(ws.path, id, model.id, step as WorkflowStep);
    return { modelId: model.id, thread };
  });

  fastify.post("/tickets/:id/spec", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveSpecSchema.parse(request.body);
    const db = getDb(workspaceId);
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) {
      writeSpec(ws.path, id, body.content);
      writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    }
    const now = new Date().toISOString();
    await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "spec", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
    return { success: true };
  });

  fastify.post("/tickets/:id/plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = savePlanSchema.parse(request.body);
    const db = getDb(workspaceId);
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) {
      writePlan(ws.path, id, body.content);
      writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    }
    const now = new Date().toISOString();
    await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "plan", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
    return { success: true };
  });

  fastify.post("/tickets/:id/tasks", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveTasksSchema.parse(request.body);
    const db = getDb(workspaceId);
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) {
      writeTasks(
        ws.path,
        id,
        body.tasks.map((t) => ({
          id: crypto.randomUUID(),
          description: t.description,
          done: t.done,
          comment: t.comment,
          status: t.status ?? "queued",
          errorMessage: t.errorMessage,
          result: t.result,
        }))
      );
      writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    }
    const now = new Date().toISOString();
    await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "tasks", newStatus: "awaiting_review" });
    engine.runTicket(workspaceId, id).catch(() => {});
    return { success: true };
  });

  fastify.post("/tickets/:id/implement", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = saveImplSchema.parse(request.body);
    const db = getDb(workspaceId);
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) {
      writeImplement(ws.path, id, body.content);
      writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    }
    const now = new Date().toISOString();
    await db.update(tickets).set({ status: "awaiting_review", updatedAt: now }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: "implement" });
    return { success: true };
  });

  fastify.post("/tickets/:id/advance", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const updatedTicket = await engine.advanceTicket(workspaceId, id);
    if (!updatedTicket) return reply.status(404).send({ error: "Ticket not found" });
    if (updatedTicket.status === "awaiting_actions") {
      return { success: true, status: "awaiting_actions" };
    }
    return { success: true, newStatus: updatedTicket.status };
  });

  fastify.post("/tickets/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const updatedTicket = await engine.approveTicket(workspaceId, id);
    if (!updatedTicket) return reply.status(404).send({ error: "Ticket not found" });
    if (updatedTicket.status === "awaiting_actions") {
      return { success: true, status: "awaiting_actions" };
    }
    return { success: true, newStatus: updatedTicket.status };
  });

  fastify.get("/tickets/:id/action-linkages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const linkages = await db.query.eventActionLinkages.findMany({
      where: eq(eventActionLinkages.ticketId, id),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    });
    const runs = linkages.length > 0
      ? await db.query.actionRuns.findMany({
          where: (runs, { inArray }) => inArray(runs.id, linkages.map((l) => l.actionRunId)),
        })
      : [];
    const runById = new Map(runs.map((r) => [r.id, r]));
    const result = linkages.map((l) => ({
      ...l,
      actionRun: runById.get(l.actionRunId) ?? null,
    }));
    return { linkages: result };
  });

  fastify.post("/tickets/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const ws = workspaceRegistry.get(workspaceId);
    const state = ws ? readTicketState(ws.path, id) : {};
    let currentStep: WorkflowStep;
    if (ticket.status === "error" && state.errorStep) {
      currentStep = state.errorStep as WorkflowStep;
    } else if (ticket.status === "awaiting_review" || ticket.status === "queued" || ticket.status === "running") {
      currentStep = ws ? deriveCurrentStepFromFiles(ws.path, id) : "spec";
    } else {
      currentStep = ticket.status as WorkflowStep;
    }

    if (ws) writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    await db.update(tickets).set({ status: currentStep, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:rejected", { workspaceId, ticketId: id, step: currentStep });
    await dispatcher?.dispatch("ticketRejected", { workspaceId, ticketId: id, step: currentStep });

    return { success: true };
  });

  fastify.post("/tickets/:id/back", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });
    if (!ticket) return reply.status(404).send({ error: "Ticket not found" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });

    const ws = workspaceRegistry.get(workspaceId);
    const state = ws ? readTicketState(ws.path, id) : {};
    let currentStep: WorkflowStep;
    if (ticket.status === "error" && state.errorStep) {
      currentStep = state.errorStep as WorkflowStep;
    } else if (ticket.status === "awaiting_review" || ticket.status === "queued" || ticket.status === "running") {
      currentStep = ws ? deriveCurrentStepFromFiles(ws.path, id) : "spec";
    } else {
      currentStep = ticket.status as WorkflowStep;
    }

    const newStatus = prevStep(currentStep);

    if (ws) {
      if (newStatus === "spec") {
        clearDownstreamArtifacts(ws.path, id, "spec");
      } else if (newStatus === "plan") {
        clearDownstreamArtifacts(ws.path, id, "plan");
      } else if (newStatus === "tasks") {
        clearDownstreamArtifacts(ws.path, id, "tasks");
      }
      writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    }

    await db.update(tickets).set({ status: newStatus, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:back", { workspaceId, ticketId: id, newStatus });
    await dispatcher?.dispatch("ticketBacked", { workspaceId, ticketId: id, step: currentStep, newStatus });

    return { success: true, newStatus };
  });

  fastify.post("/tickets/:id/queue", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    await engine.queueTicket(workspaceId, id);
    return { success: true };
  });

  fastify.post("/tickets/:id/reset", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);
    if (ws) writeTicketState(ws.path, id, { errorStep: null, errorMessage: null });
    const db = getDb(workspaceId);
    await db.update(tickets).set({ status: "spec", updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, newStatus: "spec" });
    return { success: true };
  });

  fastify.post("/tickets/:id/regenerate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = z.object({ step: z.enum(["spec", "plan", "tasks", "implement"]) }).parse(request.body);
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    const ws = workspaceRegistry.get(workspaceId);

    if (ws) {
      clearDownstreamArtifacts(ws.path, id, body.step);
      writeTicketState(ws.path, id, { errorStep: null, errorMessage: null, forceStep: body.step });
    }

    const db = getDb(workspaceId);
    await db.update(tickets).set({ status: body.step, updatedAt: new Date().toISOString() }).where(eq(tickets.id, id));
    broadcast("ticket:updated", { workspaceId, ticketId: id, step: body.step });
    engine.runTicket(workspaceId, id).catch(() => {});
    return { success: true };
  });

  fastify.post("/tickets/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    await engine.runTicket(workspaceId, id);
    return { success: true };
  });

  fastify.post("/tickets/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    if (checkArchived(id)) return reply.status(400).send({ error: "Ticket is archived" });
    await engine.cancelTicketRun(workspaceId, id);
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
