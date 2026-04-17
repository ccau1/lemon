import PQueue from "p-queue";
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { tickets } from "../db/schema.js";
import type { LlmService } from "./llm.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { WorkflowStep, IntegrationEventName } from "@lemon/shared";
import { scanWorkspaceContext } from "./context-scanner.js";
import {
  readSpec,
  writeSpec,
  readPlan,
  writePlan,
  readTasks,
  writeTasks,
  readImplement,
  isTicketArchived,
  deriveCurrentStep as deriveCurrentStepFromFiles,
  clearDownstreamArtifacts,
  readTicketState,
  writeTicketState,
  readTicketConf,
  type TaskItem,
} from "./file-sync.js";
import { getThreadMessages, appendThreadMessages, type ThreadMessage } from "./thread.js";
import type { EventDispatcher } from "./event-dispatcher.js";

const stepOrder: WorkflowStep[] = ["spec", "plan", "tasks", "implement", "done"];

function nextStep(current: WorkflowStep): WorkflowStep {
  const idx = stepOrder.indexOf(current);
  return stepOrder[Math.min(idx + 1, stepOrder.length - 1)];
}

export type BroadcastFn = (event: string, payload: unknown) => void;

export function stripPreamble(content: string): string {
  const lines = content.split("\n");
  const startIdx = lines.findIndex((l) => {
    const trimmed = l.trim();
    // Skip "Thought for..." lines entirely
    if (/^Thought for/i.test(trimmed)) return false;
    // If line starts with a bullet, check if markdown follows it
    if (trimmed.startsWith("• ")) {
      const rest = trimmed.slice(2);
      return (
        /^#{1,6}\s/.test(rest) ||
        /^[-*]\s/.test(rest) ||
        /^\d+\./.test(rest) ||
        rest.startsWith("```")
      );
    }
    return (
      /^#{1,6}\s/.test(trimmed) ||
      /^[-*]\s/.test(trimmed) ||
      /^\d+\./.test(trimmed) ||
      trimmed.startsWith("```")
    );
  });
  if (startIdx >= 0 && startIdx < lines.length && lines[startIdx].trim().startsWith("• ")) {
    lines[startIdx] = lines[startIdx].trim().slice(2);
  }
  if (startIdx > 0) return lines.slice(startIdx).join("\n").trim();
  return content.trim();
}

export const defaultPrompts: Record<WorkflowStep, string> = {
  spec: "You are an expert product manager. Write a clear, concise product spec in markdown. Use the following sections with ATX headings: # Title, ## Overview, ## In Scope, ## Out of Scope, ## Technical Requirements, ## File Structure, ## Acceptance Criteria. Use bullet lists under each section. Wrap file trees in triple backticks. Use the provided workspace context (README, docs, config files) to keep the spec realistic for the existing codebase. Do not include preamble like 'Here is the final spec:'; output only the markdown. If anything is unclear and you need to ask a clarifying question before writing the spec, respond with ONLY the text \"QUESTION: <your question here>\". Otherwise, write the complete spec.",
  plan: "You are a senior software architect. Given a spec, write a high-level implementation plan in markdown. Use the following sections with ATX headings: # Title, ## Overview, ## Key Files / Changes, ## Step-by-step Implementation, ## Testing Strategy, ## Risks and Considerations. Use bullet lists and numbered lists where appropriate. Wrap file trees or code snippets in triple backticks. Do not include preamble like 'Here is the plan:'; output only the markdown. If anything is unclear and you need to ask a clarifying question before writing the plan, respond with ONLY the text \"QUESTION: <your question here>\". Otherwise, write the complete plan.",
  tasks: 'You are a project manager. Given a plan, break it into a list of implementation tasks. Return ONLY a JSON array like [{"description":"...","done":false}, ...].',
  implement: "You are a senior engineer. Given the tasks, describe the implementation approach, key code changes, and file names in markdown. Do not include preamble like 'Here is the implementation:'; output only the markdown.",
  done: "",
};

export function parseQuestion(content: string): string | undefined {
  const match = content.trim().match(/^QUESTION:\s*([\s\S]+)$/i);
  return match ? match[1].trim() : undefined;
}

export function isValidContent(step: WorkflowStep, content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // Detect CLI garbage / tool rejection traces
  if (trimmed.startsWith("Thought for") || trimmed.includes("Rejected by user")) return false;
  if (step === "spec" || step === "plan" || step === "implement") {
    // Must contain at least one markdown heading
    return /^#{1,6}\s/m.test(trimmed);
  }
  if (step === "tasks") {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  }
  return true;
}

export class WorkflowEngine {
  private queues = new Map<string, PQueue>();
  private running = new Map<string, Set<string>>();

  constructor(
    private getDb: (workspaceId: string) => DB,
    private llm: LlmService,
    private config: ConfigManager,
    private broadcast: BroadcastFn,
    private workspaces: WorkspaceRegistry,
    private dispatcher?: EventDispatcher
  ) {}

  private getQueue(workspaceId: string): PQueue {
    if (!this.queues.has(workspaceId)) {
      const settings = this.config.resolve(workspaceId);
      this.queues.set(
        workspaceId,
        new PQueue({ concurrency: settings.parallelConcurrency })
      );
    }
    return this.queues.get(workspaceId)!;
  }

  private getRunning(workspaceId: string): Set<string> {
    if (!this.running.has(workspaceId)) {
      this.running.set(workspaceId, new Set());
    }
    return this.running.get(workspaceId)!;
  }

  async queueTicket(workspaceId: string, ticketId: string) {
    const db = this.getDb(workspaceId);
    await db
      .update(tickets)
      .set({ status: "queued", updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
    this.broadcast("ticket:queued", { workspaceId, ticketId });
    await this.dispatchStepEvent("ticketQueued", workspaceId, ticketId, "spec");
    // Immediately start processing; PQueue handles concurrency
    this.runTicket(workspaceId, ticketId).catch(() => {});
  }

  async runTicket(workspaceId: string, ticketId: string) {
    const running = this.getRunning(workspaceId);
    if (running.has(ticketId)) return;

    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });
    if (!ticket) throw new Error("Ticket not found");

    const ws = this.workspaces.get(workspaceId);
    if (ws && isTicketArchived(ws.path, ticketId)) return;

    running.add(ticketId);
    const queue = this.getQueue(workspaceId);
    return queue
      .add(async () => {
        await db
          .update(tickets)
          .set({ status: "running", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticketId));
        this.broadcast("ticket:running", { workspaceId, ticketId });
        await this.dispatchStepEvent("ticketRunning", workspaceId, ticketId, (ticket.status as WorkflowStep) || "spec");
        await this.processStep(workspaceId, ticket as any);
      })
      .finally(() => {
        running.delete(ticketId);
      });
  }

  async runQueued(workspaceId: string, allWorkspaces = false) {
    const targetWorkspaces = allWorkspaces
      ? (() => {
          // We'd need a workspace registry injected here; for now just run current
          return [workspaceId];
        })()
      : [workspaceId];

    for (const wsId of targetWorkspaces) {
      const db = this.getDb(wsId);
      const ws = this.workspaces.get(wsId);
      const allRows = await db.select().from(tickets).where(eq(tickets.status, "queued"));
      const queued = ws
        ? allRows.filter((t) => !isTicketArchived(ws.path, t.id))
        : allRows;
      this.broadcast("ticket:batch_started", {
        workspaceId: wsId,
        count: queued.length,
      });
      await this.dispatchStepEvent("ticketBatchStarted", wsId, "", "spec", { count: queued.length });
      await Promise.allSettled(queued.map((t) => this.runTicket(wsId, t.id)));
    }
  }

  private async processStep(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string; status: string }
  ) {
    const db = this.getDb(workspaceId);
    const freshTicket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticket.id),
    });
    if (!freshTicket) return;
    const step = freshTicket.status as WorkflowStep | "queued" | "running" | "awaiting_review" | "error";

    if (step === "done") return;

    // Normalize step if queued, running, awaiting_review, or error back to actual workflow step
    let currentStep: WorkflowStep = step as WorkflowStep;
    const ws = this.workspaces.get(workspaceId);
    if (step === "queued" || step === "running" || step === "awaiting_review" || step === "error") {
      if (step === "error") {
        const state = ws ? readTicketState(ws.path, ticket.id) : {};
        if (state.errorStep) {
          currentStep = state.errorStep as WorkflowStep;
        } else {
          currentStep = ws ? deriveCurrentStepFromFiles(ws.path, ticket.id) : "spec";
        }
      } else {
        currentStep = ws ? deriveCurrentStepFromFiles(ws.path, ticket.id) : "spec";
      }
    }

    try {
      if (ws) {
        writeTicketState(ws.path, ticket.id, { errorStep: null, errorMessage: null });
      }

      const settings = this.config.resolve(workspaceId);
      let autoApprove = settings.autoApprove[currentStep] ?? false;
      const ticketConf = ws ? readTicketConf(ws.path, ticket.id) : {};
      if (ticketConf.autoApprove && currentStep in ticketConf.autoApprove) {
        autoApprove = ticketConf.autoApprove[currentStep]!;
      }

      const shouldSkipGeneration = this.hasArtifact(workspaceId, ticket.id, currentStep);
      let generated = true;
      if (!shouldSkipGeneration) {
        generated = await this.generateAndSave(workspaceId, ticket, currentStep);
      }

      if (generated) {
        await this.dispatchStepEvent(`postRun${this.capitalize(currentStep)}` as IntegrationEventName, workspaceId, ticket.id, currentStep);
      }

      if (!generated) {
        // AI asked a clarifying question; pause for human input
        const ticketAfter = await db.query.tickets.findFirst({
          where: eq(tickets.id, ticket.id),
        });
        if (ticketAfter && ticketAfter.status !== "awaiting_review") {
          await db
            .update(tickets)
            .set({ status: "awaiting_review", updatedAt: new Date().toISOString() })
            .where(eq(tickets.id, ticket.id));
        }
        this.broadcast("ticket:awaiting_review", {
          workspaceId,
          ticketId: ticket.id,
          step: currentStep,
        });
        return;
      }

      // If the step handler (e.g. processTasks) already advanced the ticket to done, stop here
      const ticketAfterGeneration = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticket.id),
      });
      if (ticketAfterGeneration?.status === "done") {
        return;
      }

      if (!autoApprove) {
        await db
          .update(tickets)
          .set({ status: "awaiting_review", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticket.id));
        this.broadcast("ticket:awaiting_review", {
          workspaceId,
          ticketId: ticket.id,
          step: currentStep,
        });
        await this.dispatchStepEvent("ticketAwaitingReview", workspaceId, ticket.id, currentStep);
        return;
      }

      await this.dispatchStepEvent(`preApprove${this.capitalize(currentStep)}` as IntegrationEventName, workspaceId, ticket.id, currentStep);

      const newStep = nextStep(currentStep);
      await db
        .update(tickets)
        .set({ status: newStep, updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticket.id));

      this.broadcast("ticket:advanced", {
        workspaceId,
        ticketId: ticket.id,
        newStep,
      });

      await this.dispatchStepEvent(`postApprove${this.capitalize(currentStep)}` as IntegrationEventName, workspaceId, ticket.id, currentStep, { newStep });
      await this.dispatchStepEvent("ticketAdvanced", workspaceId, ticket.id, currentStep, { newStep });

      // Always run the next step immediately; processStep will check auto-approve after generating
      if (newStep !== "done") {
        const updated = await db.query.tickets.findFirst({
          where: eq(tickets.id, ticket.id),
        });
        if (updated) {
          await this.processStep(workspaceId, updated as any);
        }
      }
    } catch (e: any) {
      await db
        .update(tickets)
        .set({
          status: "error",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tickets.id, ticket.id));
      if (ws) {
        writeTicketState(ws.path, ticket.id, {
          errorStep: currentStep,
          errorMessage: e.message || String(e),
        });
      }
      this.broadcast("ticket:error", {
        workspaceId,
        ticketId: ticket.id,
        step: currentStep,
        error: e.message || String(e),
      });
      throw e;
    }
  }

  private hasArtifact(
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep
  ): boolean {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return false;
    switch (step) {
      case "spec":
        return readSpec(ws.path, ticketId) !== null;
      case "plan":
        return readPlan(ws.path, ticketId) !== null;
      case "tasks":
        return readTasks(ws.path, ticketId) !== null;
      case "implement":
        return false;
      default:
        return false;
    }
  }

  private async generateAndSave(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string },
    step: WorkflowStep
  ): Promise<boolean> {
    const db = this.getDb(workspaceId);
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    const model = await this.llm.resolveModel(workspaceId, ticket.projectId, step);
    if (!model) throw new Error(`No model configured for step ${step}`);

    const context = await this.buildContext(workspaceId, ticket.id, step);
    const messages = this.buildPrompt(workspaceId, step, ticket.title, ticket.description, context);
    const threadMessages = await getThreadMessages(ws.path, ticket.id, model.id);
    const allMessages: ThreadMessage[] = [...threadMessages, ...messages];
    let content = await this.llm.chat(model, allMessages, ws.path);
    content = this.stripPreamble(content);

    const question = parseQuestion(content);
    if (question) {
      await appendThreadMessages(ws.path, ticket.id, [
        ...messages.map((m) => ({ ...m, modelId: model.id, step })),
        { role: "assistant", content: `QUESTION: ${question}`, modelId: model.id, step },
      ]);
      return false;
    }

    if (!isValidContent(step, content)) {
      throw new Error("AI returned invalid or incomplete output. Please try again or regenerate this step.");
    }

    await appendThreadMessages(ws.path, ticket.id, [
      ...messages.map((m) => ({ ...m, modelId: model.id, step })),
      { role: "assistant", content, modelId: model.id, step },
    ]);

    // Clear downstream artifacts when regenerating an upstream step
    clearDownstreamArtifacts(ws.path, ticket.id, step);

    switch (step) {
      case "spec": {
        writeSpec(ws.path, ticket.id, content);
        break;
      }
      case "plan": {
        writePlan(ws.path, ticket.id, content);
        break;
      }
      case "tasks": {
        const taskList = this.parseTasks(content);
        if (taskList.length === 0) {
          throw new Error("LLM returned empty or unparseable task list");
        }
        writeTasks(
          ws.path,
          ticket.id,
          taskList.map((t) => ({
            id: crypto.randomUUID(),
            description: t.description,
            done: t.done,
            status: "queued",
          }))
        );
        break;
      }
      case "implement": {
        await this.processTasks(workspaceId, ticket);
        break;
      }
    }

    return true;
  }

  private async buildContext(
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep
  ): Promise<string> {
    let context = "";
    const ws = this.workspaces.get(workspaceId);

    if (step === "spec" || step === "plan" || step === "tasks" || step === "implement") {
      if (ws) {
        const globs = this.config.resolveContextGlobs(workspaceId, step);
        const workspaceContext = await scanWorkspaceContext({
          workspacePath: ws.path,
          globs,
        });
        context += workspaceContext;
      }
    }

    const spec = ws ? readSpec(ws.path, ticketId) : null;
    if (spec) context += `\n\nSpec:\n${spec}`;

    if (step === "plan" || step === "tasks" || step === "implement") {
      const plan = ws ? readPlan(ws.path, ticketId) : null;
      if (plan) context += `\n\nPlan:\n${plan}`;
    }

    if (step === "tasks" || step === "implement") {
      const taskList = ws ? readTasks(ws.path, ticketId) : null;
      if (taskList?.length) {
        context += `\n\nTasks:\n${taskList.map((t) => `- ${t.description}`).join("\n")}`;
      }
    }
    return context;
  }

  private buildPrompt(
    workspaceId: string,
    step: WorkflowStep,
    title: string,
    description: string,
    context: string
  ): Array<{ role: "system" | "user"; content: string }> {
    const ticketLine = description.trim()
      ? `Ticket: ${title}\nDescription: ${description}`
      : `Ticket: ${title}`;
    const configured = this.config.resolve(workspaceId).prompts[step];
    const systemContent = (configured && configured.trim()) || defaultPrompts[step];
    return [
      { role: "system", content: systemContent },
      { role: "user", content: `${ticketLine}${context}\n\nWrite the ${step}.` },
    ];
  }

  private async processTasks(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string }
  ) {
    const db = this.getDb(workspaceId);
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    let taskItems = readTasks(ws.path, ticket.id) ?? [];
    const nextTaskIndex = taskItems.findIndex((t) => t.status === "queued");
    if (nextTaskIndex === -1) {
      await this.dispatchStepEvent("preRunDone", workspaceId, ticket.id, "done");
      await db
        .update(tickets)
        .set({ status: "done", updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticket.id));
      this.broadcast("ticket:advanced", {
        workspaceId,
        ticketId: ticket.id,
        newStep: "done",
      });
      await this.dispatchStepEvent("postRunDone", workspaceId, ticket.id, "done", { newStep: "done" });
      await this.dispatchStepEvent("ticketAdvanced", workspaceId, ticket.id, "done", { newStep: "done" });
      return;
    }

    const nextTask = taskItems[nextTaskIndex];
    taskItems[nextTaskIndex] = { ...nextTask, status: "processing" };
    writeTasks(ws.path, ticket.id, taskItems);

    this.broadcast("task:updated", {
      workspaceId,
      ticketId: ticket.id,
      taskId: nextTask.id,
      status: "processing",
    });

    try {
      await this.dispatchStepEvent("taskPreRun", workspaceId, ticket.id, "implement", { taskId: nextTask.id });

      const model = await this.llm.resolveModel(workspaceId, ticket.projectId, "implement");
      if (!model) throw new Error("No model configured for implement step");

      const context = await this.buildContext(workspaceId, ticket.id, "implement");
      const messages = this.buildTaskPrompt(ticket.title, ticket.description, nextTask.description, context);
      const threadMessages = await getThreadMessages(ws.path, ticket.id, model.id);
      const allMessages: ThreadMessage[] = [...threadMessages, ...messages];
      let content = await this.llm.chat(model, allMessages, ws.path);
      content = this.stripPreamble(content);
      await appendThreadMessages(ws.path, ticket.id, [
        ...messages.map((m) => ({ ...m, modelId: model.id, step: "implement" as WorkflowStep })),
        { role: "assistant", content, modelId: model.id, step: "implement" },
      ]);

      // Re-read tasks to avoid clobbering concurrent updates
      taskItems = readTasks(ws.path, ticket.id) ?? [];
      const idx = taskItems.findIndex((t) => t.id === nextTask.id);
      if (idx !== -1) {
        taskItems[idx] = {
          ...taskItems[idx],
          status: "done",
          done: true,
          result: content,
        };
        writeTasks(ws.path, ticket.id, taskItems);
      }

      this.broadcast("task:updated", {
        workspaceId,
        ticketId: ticket.id,
        taskId: nextTask.id,
        status: "done",
        result: content,
      });

      await this.dispatchStepEvent("taskPostRun", workspaceId, ticket.id, "implement", { taskId: nextTask.id, result: content });

      await this.processTasks(workspaceId, ticket);
    } catch (e: any) {
      // Re-read tasks before updating
      taskItems = readTasks(ws.path, ticket.id) ?? [];
      const idx = taskItems.findIndex((t) => t.id === nextTask.id);
      if (idx !== -1) {
        taskItems[idx] = {
          ...taskItems[idx],
          status: "error",
          errorMessage: e.message || String(e),
        };
        writeTasks(ws.path, ticket.id, taskItems);
      }

      await db
        .update(tickets)
        .set({
          status: "error",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tickets.id, ticket.id));
      if (ws) {
        writeTicketState(ws.path, ticket.id, {
          errorStep: "implement",
          errorMessage: e.message || String(e),
        });
      }

      this.broadcast("task:updated", {
        workspaceId,
        ticketId: ticket.id,
        taskId: nextTask.id,
        status: "error",
        error: e.message || String(e),
      });
      this.broadcast("ticket:error", {
        workspaceId,
        ticketId: ticket.id,
        step: "implement",
        error: e.message || String(e),
      });
      await this.dispatchStepEvent("taskError", workspaceId, ticket.id, "implement", { taskId: nextTask.id, error: e.message || String(e) });
      await this.dispatchStepEvent("ticketError", workspaceId, ticket.id, "implement", { error: e.message || String(e) });
      throw e;
    }
  }

  private buildTaskPrompt(
    title: string,
    description: string,
    taskDescription: string,
    context: string
  ): Array<{ role: "system" | "user"; content: string }> {
    const ticketLine = description.trim()
      ? `Ticket: ${title}\nDescription: ${description}`
      : `Ticket: ${title}`;
    return [
      {
        role: "system",
        content:
          "You are a senior engineer. Implement the following task. Describe the implementation approach, key code changes, and file names in markdown. Do not include preamble like 'Here is the implementation:'; output only the markdown.",
      },
      {
        role: "user",
        content: `${ticketLine}\n\nTask: ${taskDescription}${context}\n\nWrite the implementation for this task.`,
      },
    ];
  }

  private stripPreamble(content: string): string {
    return stripPreamble(content);
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private async dispatchStepEvent(
    event: IntegrationEventName,
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep,
    extra?: Record<string, unknown>
  ): Promise<void> {
    if (!this.dispatcher) return;
    await this.dispatcher.dispatch(event, { workspaceId, ticketId, step, ...extra });
  }

  private parseTasks(content: string): Array<{ description: string; done: boolean }> {
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const json = JSON.parse(content.slice(start, end + 1).replace(/\s*\n\s*/g, ""));
        if (Array.isArray(json)) {
          return json.map((t: any) => ({
            description: String(t.description ?? ""),
            done: Boolean(t.done ?? false),
          }));
        }
      } catch {
        // ignore and fallback
      }
    }
    // fallback: treat each line as a task
    return content
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter((l) => l.length > 0)
      .map((l) => ({ description: l, done: false }));
  }
}
