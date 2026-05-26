import PQueue from "p-queue";
import { eq, and, or } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { tickets, eventActionLinkages, stepRuns } from "../db/schema.js";
import type { LlmService } from "./llm.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { WorkflowStep, IntegrationEventName } from "@lemon/shared";
import { scanWorkspaceContext } from "./context-scanner.js";
import {
  hasStepArtifact,
  readStep,
  writeStep,
  readTasks,
  writeTasks,
  readImplement,
  isTicketArchived,
  deriveCurrentStep as deriveCurrentStepFromFiles,
  clearDownstreamArtifacts,
  markDownstreamOutdated,
  clearOutdatedStep,
  readOutdatedSteps,
  readTicketState,
  writeTicketState,
  readTicketConf,
  type TaskItem,
} from "./file-sync.js";
import { getThreadMessages, appendThreadMessages, type ThreadMessage } from "./thread.js";
import type { EventDispatcher } from "./event-dispatcher.js";
import type { ActionTriggerService } from "./action-trigger.js";

const stepOrder: WorkflowStep[] = ["spec", "plan", "tasks", "implement", "done"];

class StopError extends Error {
  constructor() {
    super("Implementation stopped by user");
    this.name = "StopError";
  }
}

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
  tasks: 'You are a project manager. Given a plan, break it into a list of implementation tasks. Each task has a concise title (one line, under 8 words) and a detailed description (indented lines below). The description must be significantly more detailed than the title — include specific file paths, exact values, expected behavior, and constraints. The description must be self-contained so the task can run independently without reading other tasks. Format:\n- [ ] Short task title\n  Detailed description with specifics...\n- [ ] Another short title\n  Its detailed description...\nDo not include preamble; output only the markdown checklist. If anything is unclear and you need to ask a clarifying question before writing the tasks, respond with ONLY the text "QUESTION: <your question here>".',
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
    return /^\s*[-*]\s+\[[ xX]\]/m.test(trimmed);
  }
  return true;
}

export function assertValidContent(step: WorkflowStep, content: string): void {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("AI returned empty output. Please try again or regenerate this step.");
  }
  if (trimmed.startsWith("Thought for") || trimmed.includes("Rejected by user")) {
    throw new Error(
      "AI attempted to use workspace tools (e.g., reading files) but the tool calls were rejected. " +
        "This usually happens when a CLI-based model runs without auto-approval. " +
        "Please regenerate this step — the configuration has been updated to allow tools."
    );
  }
  if (step === "spec" || step === "plan" || step === "implement") {
    if (!/^#{1,6}\s/m.test(trimmed)) {
      throw new Error(
        `AI returned ${step} without markdown headings. Please try again or regenerate this step.`
      );
    }
    return;
  }
  if (step === "tasks") {
    if (!/^\s*[-*]\s+\[[ xX]\]/m.test(trimmed)) {
      throw new Error("AI returned tasks that are not a valid markdown task list. Please try again or regenerate this step.");
    }
    return;
  }
}

export class WorkflowEngine {
  private queues = new Map<string, PQueue>();
  private running = new Map<string, Set<string>>();
  private abortControllers = new Map<string, AbortController>();
  private stoppedTickets = new Set<string>();
  private processingTaskIds = new Map<string, Set<string>>();

  constructor(
    private getDb: (workspaceId: string) => DB,
    private llm: LlmService,
    private config: ConfigManager,
    private broadcast: BroadcastFn,
    private workspaces: WorkspaceRegistry,
    private dispatcher?: EventDispatcher,
    private actionTriggerService?: ActionTriggerService
  ) {}

  setActionTriggerService(service: ActionTriggerService) {
    this.actionTriggerService = service;
  }

  private async recordStepRun(
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep,
    modelId: string,
    startedAtMs: number,
    durationMs: number,
    status: "done" | "error"
  ) {
    const db = this.getDb(workspaceId);
    await db.insert(stepRuns).values({
      id: crypto.randomUUID(),
      ticketId,
      step,
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(startedAtMs + durationMs).toISOString(),
      durationMs,
      modelId,
      status,
      createdAt: new Date().toISOString(),
    });
  }

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

  private getProcessingTaskIds(ticketId: string): Set<string> {
    if (!this.processingTaskIds.has(ticketId)) {
      this.processingTaskIds.set(ticketId, new Set());
    }
    return this.processingTaskIds.get(ticketId)!;
  }

  async queueTicket(workspaceId: string, ticketId: string) {
    const db = this.getDb(workspaceId);
    await db
      .update(tickets)
      .set({ state: "queued", status: "in_progress", updatedAt: new Date().toISOString() })
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
    this.stoppedTickets.delete(ticketId);
    let controller = this.abortControllers.get(ticketId);
    if (!controller) {
      controller = new AbortController();
      this.abortControllers.set(ticketId, controller);
    }

    if (ticket.state === "awaiting_actions") {
      return this.resumeTicket(workspaceId, ticketId).finally(() => {
        running.delete(ticketId);
        this.abortControllers.delete(ticketId);
      });
    }

    const queue = this.getQueue(workspaceId);
    return queue
      .add(async () => {
        if (controller.signal.aborted) return;
        await db
          .update(tickets)
          .set({ state: "running", status: "in_progress", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticketId));
        this.broadcast("ticket:running", { workspaceId, ticketId });
        await this.dispatchStepEvent("ticketRunning", workspaceId, ticketId, (ticket.step as WorkflowStep) || "spec");
        await this.processStep(workspaceId, ticket as any);
      })
      .finally(() => {
        running.delete(ticketId);
        const inFlight = this.getProcessingTaskIds(ticketId);
        if (inFlight.size === 0) {
          this.abortControllers.delete(ticketId);
          this.processingTaskIds.delete(ticketId);
        }
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
      const allRows = await db.select().from(tickets).where(eq(tickets.state, "queued"));
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

  async recover(registry: WorkspaceRegistry): Promise<void> {
    for (const ws of registry.list()) {
      const db = this.getDb(ws.id);
      const rows = await db
        .select()
        .from(tickets)
        .where(or(eq(tickets.state, "queued"), eq(tickets.state, "running")));

      if (rows.length === 0) continue;

      for (const row of rows) {
        if (isTicketArchived(ws.path, row.id)) continue;

        // Reset any tasks stuck in "processing" back to "pending" (pipeline was interrupted)
        const taskItems = readTasks(ws.path, row.id);
        if (taskItems && taskItems.some((t) => t.status === "processing")) {
          const resetTasks = taskItems.map((t) =>
            t.status === "processing" ? { ...t, status: "pending" as const } : t
          );
          writeTasks(ws.path, row.id, resetTasks);
        }
        this.processingTaskIds.delete(row.id);

        // If it was running when the server crashed, reset to queued
        if (row.state === "running") {
          await db
            .update(tickets)
            .set({ state: "queued", status: "in_progress", updatedAt: new Date().toISOString() })
            .where(eq(tickets.id, row.id));
          this.broadcast("ticket:queued", { workspaceId: ws.id, ticketId: row.id });
        }

        // Re-start processing; runTicket handles deduplication and queueing
        this.runTicket(ws.id, row.id).catch(() => {});
      }
    }
  }

  private resolveCurrentStep(
    ticket: { id: string; step: string },
    workspacePath?: string
  ): WorkflowStep {
    const step = ticket.step as WorkflowStep;
    if (step === "done" && workspacePath) {
      const tasks = readTasks(workspacePath, ticket.id);
      if (tasks && tasks.some((t) => t.status === "pending" || t.status === "queued" || t.status === "processing")) {
        return "implement";
      }
    }
    return step;
  }

  private async pauseTicket(
    db: DB,
    ticketId: string,
    step: WorkflowStep,
    event: IntegrationEventName,
    resumeTarget: string
  ) {
    await db
      .update(tickets)
      .set({ state: "awaiting_actions", status: "pending", step, pendingEvent: event, resumeTarget, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
  }

  private async setAwaitingReview(
    db: DB,
    ticketId: string,
    step: WorkflowStep,
    workspaceId: string
  ) {
    const current = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (current && current.state !== "awaiting_review") {
      await db
        .update(tickets)
        .set({ state: "awaiting_review", status: "pending", step, pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
    }
    this.broadcast("ticket:awaiting_review", { workspaceId, ticketId, step });
  }

  private async canAdvanceFromImplement(workspaceId: string, ticketId: string): Promise<boolean> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return true;
    const taskItems = readTasks(ws.path, ticketId) ?? [];
    return !taskItems.some((t) => t.status === "error");
  }

  private async advanceTicketStatus(
    db: DB,
    ticketId: string,
    newStep: WorkflowStep
  ) {
    const isDone = newStep === "done";
    await db
      .update(tickets)
      .set({ step: newStep, state: isDone ? "done" : "idle", status: isDone ? "done" : "pending", pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
  }

  private async setTicketError(
    db: DB,
    ticketId: string,
    step: WorkflowStep,
    error: any,
    workspaceId: string,
    workspacePath?: string
  ) {
    await db
      .update(tickets)
      .set({ state: "error", status: "error", step, pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
    if (workspacePath) {
      writeTicketState(workspacePath, ticketId, { errorStep: step, errorMessage: error.message || String(error) });
    }
    this.broadcast("ticket:error", { workspaceId, ticketId, step, error: error.message || String(error) });
  }

  async cancelTicketRun(workspaceId: string, ticketId: string): Promise<void> {
    const controller = this.abortControllers.get(ticketId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(ticketId);
    }
    const running = this.getRunning(workspaceId);
    running.delete(ticketId);
    this.processingTaskIds.delete(ticketId);
    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) throw new Error("Ticket not found");
    const step = (ticket.step as WorkflowStep) || deriveCurrentStepFromFiles(this.workspaces.get(workspaceId)?.path || "", ticketId);
    await this.setTicketError(db, ticketId, step, new Error("Run cancelled by user"), workspaceId, this.workspaces.get(workspaceId)?.path);
  }

  async stopImplementation(workspaceId: string, ticketId: string): Promise<void> {
    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) throw new Error("Ticket not found");
    if (ticket.step !== "implement" && ticket.step !== "done") {
      throw new Error("Ticket is not in implement step");
    }
    const controller = this.abortControllers.get(ticketId);
    if (controller) {
      this.stoppedTickets.add(ticketId);
      controller.abort();
      this.abortControllers.delete(ticketId);
    }
    const running = this.getRunning(workspaceId);
    running.delete(ticketId);
    const ws = this.workspaces.get(workspaceId);

    if (ws) {
      const taskItems = readTasks(ws.path, ticketId) ?? [];
      const resetTasks = taskItems.map((t) =>
        t.status === "processing" || t.status === "error" || t.status === "queued"
          ? { ...t, status: "pending" as const, errorMessage: undefined, thoughts: undefined }
          : t
      );
      writeTasks(ws.path, ticketId, resetTasks);
    }
    this.processingTaskIds.delete(ticketId);

    await db
      .update(tickets)
      .set({ step: "implement", state: "stopped", status: "pending", pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
    if (ws) {
      writeTicketState(ws.path, ticketId, { errorStep: null, errorMessage: null });
    }
    this.broadcast("ticket:stopped", { workspaceId, ticketId });
  }

  async startImplementation(workspaceId: string, ticketId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (ws) {
      const taskItems = readTasks(ws.path, ticketId) ?? [];
      const needsReset = taskItems.some((t) => t.status === "error" || t.status === "processing" || t.status === "pending");
      if (needsReset) {
        const resetTasks = taskItems.map((t) =>
          t.status === "error" || t.status === "processing" || t.status === "pending"
            ? { ...t, status: "queued" as const, errorMessage: undefined, thoughts: undefined }
            : t
        );
        writeTasks(ws.path, ticketId, resetTasks);
      }
    }
    this.processingTaskIds.delete(ticketId);
    if (ticket && ticket.step === "done") {
      await db
        .update(tickets)
        .set({ step: "implement", state: "idle", status: "pending", updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
    }
    if (ws) writeTicketState(ws.path, ticketId, { errorStep: null, errorMessage: null });
    await this.runTicket(workspaceId, ticketId);
  }

  async retryTask(workspaceId: string, ticketId: string, taskId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    const taskItems = readTasks(ws.path, ticketId) ?? [];
    const idx = taskItems.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error("Task not found");

    taskItems[idx] = { ...taskItems[idx], status: "queued" as const, errorMessage: undefined };
    writeTasks(ws.path, ticketId, taskItems);

    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) throw new Error("Ticket not found");

    if (ticket.state === "error" || ticket.step === "done") {
      await db
        .update(tickets)
        .set({ step: "implement", state: "idle", status: "pending", updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
    }
    writeTicketState(ws.path, ticketId, { errorStep: null, errorMessage: null });

    this.broadcast("task:updated", {
      workspaceId,
      ticketId,
      taskId,
      status: "queued",
    });

    await this.runTicket(workspaceId, ticketId);
  }

  async recoverTicket(workspaceId: string, ticketId: string): Promise<{ recovered: boolean; message: string }> {
    const running = this.getRunning(workspaceId);
    if (running.has(ticketId)) {
      return { recovered: false, message: "Ticket is actively running" };
    }

    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) throw new Error("Ticket not found");

    if (ticket.state !== "running" && ticket.state !== "queued") {
      return { recovered: false, message: `Ticket state is ${ticket.state}, not stuck` };
    }

    const ws = this.workspaces.get(workspaceId);
    if (ws) {
      const taskItems = readTasks(ws.path, ticketId);
      if (taskItems && taskItems.some((t) => t.status === "processing")) {
        const resetTasks = taskItems.map((t) =>
          t.status === "processing" ? { ...t, status: "pending" as const } : t
        );
        writeTasks(ws.path, ticketId, resetTasks);
      }
    }
    this.processingTaskIds.delete(ticketId);

    await db
      .update(tickets)
      .set({ state: "queued", status: "in_progress", updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
    this.broadcast("ticket:queued", { workspaceId, ticketId });

    this.runTicket(workspaceId, ticketId).catch(() => {});
    return { recovered: true, message: "Ticket recovered and re-queued" };
  }

  async validateStartEarly(
    workspaceId: string,
    ticketId: string,
    taskId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    const taskItems = readTasks(ws.path, ticketId) ?? [];
    const idx = taskItems.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error("Task not found");

    const earlyTask = taskItems[idx];
    const priorTasks = taskItems.slice(0, idx);

    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    const model = await this.llm.resolveModel(workspaceId, ticket?.projectId ?? "", "implement");
    if (!model) return { allowed: true }; // no model configured, allow fallback

    const messages = this.buildStartEarlyValidationPrompt(earlyTask, priorTasks);
    const signal = this.abortControllers.get(ticketId)?.signal;

    try {
      const { content } = await this.llm.chat(model, messages, ws.path, signal);
      const jsonMatch = content.trim().match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { allowed: true }; // unparseable, default allow
      const result = JSON.parse(jsonMatch[0]);
      if (typeof result.allowed === "boolean") {
        return { allowed: result.allowed, reason: result.reason };
      }
      return { allowed: true };
    } catch {
      return { allowed: true }; // validation failed, default allow
    }
  }

  private buildStartEarlyValidationPrompt(
    earlyTask: TaskItem,
    priorTasks: TaskItem[]
  ): Array<{ role: "system" | "user"; content: string }> {
    const tableRows = priorTasks
      .map((t, i) => {
        const desc = t.description.replace(/\n/g, " ").slice(0, 120);
        const ellipsis = t.description.length > 120 ? "..." : "";
        return `| ${i + 1} | ${t.title} | ${desc}${ellipsis} | ${t.status ?? "pending"} |`;
      })
      .join("\n");

    return [
      {
        role: "system",
        content:
          'You are a task dependency analyzer. Given a task that a user wants to start early (run in parallel with incomplete prior tasks) and a list of prior tasks with their statuses, determine if the early task can safely run in parallel. Consider file dependencies, data dependencies, and logical ordering. Respond with ONLY a JSON object: {"allowed":true} or {"allowed":false,"reason":"short reason"}. Be conservative — reject if there is any dependency risk.',
      },
      {
        role: "user",
        content: `Task to start early:\nTitle: ${earlyTask.title}\nDescription: ${earlyTask.description}\n\nPrior tasks:\n| # | Title | Description | Status |\n|---|-------|-------------|--------|\n${tableRows}\n\nCan the task "${earlyTask.title}" safely run in parallel with any incomplete prior tasks?`,
      },
    ];
  }

  async startTaskEarly(workspaceId: string, ticketId: string, taskId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    const taskItems = readTasks(ws.path, ticketId) ?? [];
    const idx = taskItems.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error("Task not found");
    if (taskItems[idx].status !== "queued") {
      throw new Error("Task is not queued");
    }

    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) throw new Error("Ticket not found");

    if (ticket.state === "error") {
      await db
        .update(tickets)
        .set({ step: "implement", state: "idle", status: "pending", updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
      writeTicketState(ws.path, ticketId, { errorStep: null, errorMessage: null });
    }

    // Ensure an abort controller exists so stopImplementation can cancel this task
    if (!this.abortControllers.has(ticketId)) {
      this.abortControllers.set(ticketId, new AbortController());
    }

    if (ticket.state !== "running" && ticket.state !== "queued") {
      await db
        .update(tickets)
        .set({ state: "running", status: "in_progress", updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
      this.broadcast("ticket:running", { workspaceId, ticketId });
    }

    // Start the specific task directly without cancelling prior tasks
    this.stoppedTickets.delete(ticketId);
    const runEarly = async () => {
      try {
        await this.processSingleTask(workspaceId, ticket as any, taskId, false);
      } catch {
        // processSingleTask handles its own error reporting
      } finally {
        const items = readTasks(ws.path, ticketId) ?? [];
        const inFlight = this.getProcessingTaskIds(ticketId);
        const hasActive = items.some((t) => inFlight.has(t.id) && t.status === "processing");
        if (!hasActive) {
          this.processTasks(workspaceId, ticket as any).catch(() => {});
        }
      }
    };
    runEarly();
  }

  private markdownStepHandler(step: Exclude<WorkflowStep, "tasks" | "implement" | "done">) {
    return {
      hasArtifact: (p: string, id: string) => hasStepArtifact(p, id, step),
      generate: async (wsId: string, t: any) =>
        (await this.generateMarkdownArtifact(wsId, t, step, (p, id, c) => writeStep(p, id, step, c))).success,
    };
  }

  private stepHandlers: Record<WorkflowStep, {
    hasArtifact: (wsPath: string, ticketId: string) => boolean;
    generate: (workspaceId: string, ticket: any, step: WorkflowStep) => Promise<boolean>;
  }> = {
    spec: this.markdownStepHandler("spec"),
    plan: this.markdownStepHandler("plan"),
    tasks: {
      hasArtifact: (p, id) => hasStepArtifact(p, id, "tasks"),
      generate: (wsId, t) => this.generateTasksFromMarkdown(wsId, t, "tasks"),
    },
    implement: {
      hasArtifact: () => false,
      generate: (wsId, t) => this.processTasks(wsId, t),
    },
    done: {
      hasArtifact: () => true,
      generate: () => Promise.resolve(true),
    },
  };

  private async processStep(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string; status: string }
  ) {
    const db = this.getDb(workspaceId);
    const freshTicket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
    if (!freshTicket) return;

    const ws = this.workspaces.get(workspaceId);
    const currentStep = this.resolveCurrentStep(freshTicket as any, ws?.path);

    // done step: events only, no generation
    if (currentStep === "done") {
      const pre = await this.dispatchStepEvent("preRunDone", workspaceId, ticket.id, "done");
      if (pre) return this.pauseTicket(db, ticket.id, "done", "preRunDone", "processStep");
      const post = await this.dispatchStepEvent("postRunDone", workspaceId, ticket.id, "done", { newStep: "done" });
      if (post) return this.pauseTicket(db, ticket.id, "done", "postRunDone", "processStep");
      return;
    }

    try {
      const state = ws ? readTicketState(ws.path, ticket.id) : {};
      const forceStep = state.forceStep;
      if (ws) writeTicketState(ws.path, ticket.id, { errorStep: null, errorMessage: null, forceStep: null });

      const settings = this.config.resolve(workspaceId);
      let autoApprove = settings.autoApprove[currentStep] ?? false;
      const ticketConf = ws ? readTicketConf(ws.path, ticket.id) : {};
      if (ticketConf.autoApprove && currentStep in ticketConf.autoApprove) {
        autoApprove = ticketConf.autoApprove[currentStep]!;
      }

      const handler = this.stepHandlers[currentStep];
      const outdatedSteps = ws ? readOutdatedSteps(ws.path, ticket.id) : [];
      const isOutdated = outdatedSteps.includes(currentStep);
      const shouldSkip = ws ? (forceStep !== currentStep && handler.hasArtifact(ws.path, ticket.id) && !isOutdated) : false;
      let generated = true;

      const preRunEvent = `preRun${this.capitalize(currentStep)}` as IntegrationEventName;
      if (await this.dispatchStepEvent(preRunEvent, workspaceId, ticket.id, currentStep)) {
        return this.pauseTicket(db, ticket.id, currentStep, preRunEvent, "processStep");
      }

      if (!shouldSkip) {
        generated = await handler.generate(workspaceId, ticket, currentStep);
      }

      // Guard: if ticket was stopped during generation, do not advance or pause
      if (this.stoppedTickets.has(ticket.id)) {
        return;
      }

      if (generated && !shouldSkip) {
        if (ws) clearOutdatedStep(ws.path, ticket.id, currentStep);
      }
      if (generated) {
        const postRunEvent = `postRun${this.capitalize(currentStep)}` as IntegrationEventName;
        if (await this.dispatchStepEvent(postRunEvent, workspaceId, ticket.id, currentStep)) {
          return this.pauseTicket(db, ticket.id, currentStep, postRunEvent, "processStep");
        }
      }

      if (!generated) {
        return this.setAwaitingReview(db, ticket.id, currentStep, workspaceId);
      }

      // implement handler may have already advanced ticket to done
      const afterGen = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
      if (afterGen?.step === "done") return;

      if (!autoApprove) {
        await this.setAwaitingReview(db, ticket.id, currentStep, workspaceId);
        await this.dispatchStepEvent("ticketAwaitingReview", workspaceId, ticket.id, currentStep);
        return;
      }

      const preApproveEvent = `preApprove${this.capitalize(currentStep)}` as IntegrationEventName;
      if (await this.dispatchStepEvent(preApproveEvent, workspaceId, ticket.id, currentStep)) {
        return this.pauseTicket(db, ticket.id, currentStep, preApproveEvent, "processStep");
      }

      const newStep = nextStep(currentStep);
      if (currentStep === "implement" && !(await this.canAdvanceFromImplement(workspaceId, ticket.id))) {
        return this.setAwaitingReview(db, ticket.id, currentStep, workspaceId);
      }
      await this.advanceTicketStatus(db, ticket.id, newStep);
      this.broadcast("ticket:advanced", { workspaceId, ticketId: ticket.id, newStep });

      const postApproveEvent = `postApprove${this.capitalize(currentStep)}` as IntegrationEventName;
      if (await this.dispatchStepEvent(postApproveEvent, workspaceId, ticket.id, currentStep, { newStep })) {
        return this.pauseTicket(db, ticket.id, newStep, postApproveEvent, "processStep");
      }

      await this.dispatchStepEvent("ticketAdvanced", workspaceId, ticket.id, currentStep, { newStep });

      if (newStep !== "done") {
        const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, ticket.id) });
        if (updated) {
          if (updated.state !== "running" && updated.state !== "queued") {
            await db
              .update(tickets)
              .set({ state: "running", status: "in_progress", pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
              .where(eq(tickets.id, ticket.id));
            this.broadcast("ticket:running", { workspaceId, ticketId: ticket.id });
            (updated as any).state = "running";
            (updated as any).status = "in_progress";
          }
          try { await this.processStep(workspaceId, updated as any); } catch {}
        }
      }
    } catch (e: any) {
      if (e.name === "StopError") {
        return;
      }
      await this.setTicketError(db, ticket.id, currentStep, e, workspaceId, ws?.path);
      throw e;
    }
  }

  private async generateMarkdownArtifact(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string },
    step: WorkflowStep,
    writer: (path: string, ticketId: string, content: string) => void
  ): Promise<{ success: boolean; content: string }> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    const model = await this.llm.resolveModel(workspaceId, ticket.projectId, step);
    if (!model) throw new Error(`No model configured for step ${step}`);

    const context = await this.buildContext(workspaceId, ticket.id, step);
    const messages = this.buildPrompt(workspaceId, step, ticket.title, ticket.description, context);
    const threadMessages = await getThreadMessages(ws.path, ticket.id, model.id, step);
    const signal = this.abortControllers.get(ticket.id)?.signal;
    const callStartedAt = Date.now();
    let content: string;
    let durationMs: number;
    try {
      const result = await this.llm.chat(model, [...threadMessages, ...messages], ws.path, signal);
      content = result.content;
      durationMs = result.durationMs;
    } catch (e) {
      durationMs = Date.now() - callStartedAt;
      await this.recordStepRun(workspaceId, ticket.id, step, model.id, callStartedAt, durationMs, "error");
      throw e;
    }
    await this.recordStepRun(workspaceId, ticket.id, step, model.id, callStartedAt, durationMs, "done");
    content = this.stripPreamble(content);

    const question = parseQuestion(content);
    if (question) {
      await appendThreadMessages(ws.path, ticket.id, [
        ...messages.map((m) => ({ ...m, modelId: model.id, step })),
        { role: "assistant", content: `QUESTION: ${question}`, modelId: model.id, step },
      ]);
      return { success: false, content: "" };
    }

    assertValidContent(step, content);

    await appendThreadMessages(ws.path, ticket.id, [
      ...messages.map((m) => ({ ...m, modelId: model.id, step })),
      { role: "assistant", content, modelId: model.id, step },
    ]);

    markDownstreamOutdated(ws.path, ticket.id, step);
    writer(ws.path, ticket.id, content);
    clearOutdatedStep(ws.path, ticket.id, step);
    return { success: true, content };
  }

  private async generateTasksFromMarkdown(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string },
    step: WorkflowStep
  ): Promise<boolean> {
    const { success, content } = await this.generateMarkdownArtifact(workspaceId, ticket, step, () => {});
    if (!success) return false;

    const taskList = this.parseTasks(content);
    if (taskList.length === 0) {
      throw new Error("LLM returned empty or unparseable task list");
    }

    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");
    writeTasks(
      ws.path,
      ticket.id,
      taskList.map((t) => ({ id: crypto.randomUUID(), title: t.title, description: t.description, done: t.done, status: "pending" as const }))
    );
    clearOutdatedStep(ws.path, ticket.id, "tasks");
    markDownstreamOutdated(ws.path, ticket.id, "tasks");
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

    const spec = ws ? readStep(ws.path, ticketId, "spec") : null;
    if (spec) context += `\n\nSpec:\n${spec}`;

    if (step === "plan" || step === "tasks" || step === "implement") {
      const plan = ws ? readStep(ws.path, ticketId, "plan") : null;
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
  ): Promise<boolean> {
    const db = this.getDb(workspaceId);
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    if (this.stoppedTickets.has(ticket.id)) {
      return true;
    }
    let taskItems = readTasks(ws.path, ticket.id) ?? [];
    // Convert pending tasks to queued when the pipeline is active
    const hasPendingTasks = taskItems.some((t) => t.status === "pending");
    if (hasPendingTasks) {
      taskItems = taskItems.map((t) =>
        t.status === "pending" ? { ...t, status: "queued" as const } : t
      );
      writeTasks(ws.path, ticket.id, taskItems);
    }
    const inFlight = this.getProcessingTaskIds(ticket.id);
    // If another task is actively processing (e.g., an early-started task running in parallel),
    // wait until it finishes before picking the next one so we keep the default 1-by-1 queue.
    const hasActiveProcessing = taskItems.some((t) => inFlight.has(t.id) && t.status === "processing");
    if (hasActiveProcessing) {
      return true;
    }
    const nextTaskIndex = taskItems.findIndex((t) => t.status === "queued" && !inFlight.has(t.id));
    if (nextTaskIndex === -1) {
      const hasPending = taskItems.some((t) => t.status === "queued" || t.status === "processing");
      if (hasPending) return true;

      const preRunDonePaused = await this.dispatchStepEvent("preRunDone", workspaceId, ticket.id, "done");
      if (preRunDonePaused) {
        await db
          .update(tickets)
          .set({ step: "done", state: "awaiting_actions", status: "pending", pendingEvent: "preRunDone", resumeTarget: "processTasks", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticket.id));
        return true;
      }
      await db
        .update(tickets)
        .set({ step: "done", state: "idle", status: "done", pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticket.id));
      this.broadcast("ticket:advanced", {
        workspaceId,
        ticketId: ticket.id,
        newStep: "done",
      });
      const postRunDonePaused = await this.dispatchStepEvent("postRunDone", workspaceId, ticket.id, "done", { newStep: "done" });
      if (postRunDonePaused) {
        await db
          .update(tickets)
          .set({ step: "done", state: "awaiting_actions", status: "pending", pendingEvent: "postRunDone", resumeTarget: "processStep", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticket.id));
        return true;
      }
      await this.dispatchStepEvent("ticketAdvanced", workspaceId, ticket.id, "done", { newStep: "done" });
      return true;
    }

    const nextTask = taskItems[nextTaskIndex];
    inFlight.add(nextTask.id);
    taskItems[nextTaskIndex] = { ...nextTask, status: "processing" };
    writeTasks(ws.path, ticket.id, taskItems);

    this.broadcast("task:updated", {
      workspaceId,
      ticketId: ticket.id,
      taskId: nextTask.id,
      status: "processing",
    });

    try {
      await this.processSingleTask(workspaceId, ticket, nextTask.id);
    } catch {
      // processSingleTask handles its own error reporting
    }
    return true;
  }

  private async processSingleTask(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string },
    taskId: string,
    resumeQueue: boolean = true
  ): Promise<void> {
    const db = this.getDb(workspaceId);
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error("Workspace not found");

    const inFlight = this.getProcessingTaskIds(ticket.id);
    if (!inFlight.has(taskId)) {
      const items = readTasks(ws.path, ticket.id) ?? [];
      const t = items.find((t) => t.id === taskId);
      if (!t || t.status !== "queued") return;
      inFlight.add(taskId);
    }

    if (this.stoppedTickets.has(ticket.id)) {
      inFlight.delete(taskId);
      return;
    }

    try {
      let taskItems = readTasks(ws.path, ticket.id) ?? [];
      const idx = taskItems.findIndex((t) => t.id === taskId);
      if (idx === -1) return;
      if (taskItems[idx].status !== "processing") {
        if (taskItems[idx].status !== "queued") return;
        taskItems[idx] = { ...taskItems[idx], status: "processing" };
        writeTasks(ws.path, ticket.id, taskItems);
      }

      const task = taskItems[idx];

      await this.dispatchStepEvent("taskPreRun", workspaceId, ticket.id, "implement", { taskId });

      const model = await this.llm.resolveModel(workspaceId, ticket.projectId, "implement");
      if (!model) throw new Error("No model configured for implement step");

      const context = await this.buildContext(workspaceId, ticket.id, "implement");
      const messages = this.buildTaskPrompt(ticket.title, ticket.description, task.description, context);
      // Tasks are independent: do not accumulate full implement thread history
      // into every task prompt to avoid unbounded growth and timeouts.
      const allMessages: ThreadMessage[] = messages;
      const signal = this.abortControllers.get(ticket.id)?.signal;
      const callStartedAt = Date.now();
      let content = "";
      let durationMs: number;
      try {
        const stream = await this.llm.chatStream(model, allMessages, ws.path, signal);
        let buffer = "";
        let lastBroadcast = Date.now();
        for await (const chunk of stream) {
          if (signal?.aborted) break;
          buffer += chunk;
          content += chunk;
          const now = Date.now();
          if (now - lastBroadcast > 300) {
            this.broadcast("task:updated", {
              workspaceId,
              ticketId: ticket.id,
              taskId,
              status: "processing",
              thoughts: buffer,
            });
            lastBroadcast = now;
          }
        }
        if (signal?.aborted) {
          throw new StopError();
        }
        durationMs = Date.now() - callStartedAt;
      } catch (e: any) {
        durationMs = Date.now() - callStartedAt;
        await this.recordStepRun(workspaceId, ticket.id, "implement", model.id, callStartedAt, durationMs, "error");
        if (e.message?.includes("Run cancelled by user")) {
          throw new StopError();
        }
        throw e;
      }
      await this.recordStepRun(workspaceId, ticket.id, "implement", model.id, callStartedAt, durationMs, "done");
      content = this.stripPreamble(content);
      await appendThreadMessages(ws.path, ticket.id, [
        ...messages.map((m) => ({ ...m, modelId: model.id, step: "implement" as WorkflowStep })),
        { role: "assistant", content, modelId: model.id, step: "implement" },
      ]);

      taskItems = readTasks(ws.path, ticket.id) ?? [];
      const doneIdx = taskItems.findIndex((t) => t.id === taskId);
      if (doneIdx !== -1) {
        taskItems[doneIdx] = {
          ...taskItems[doneIdx],
          status: "done",
          done: true,
          result: content,
          thoughts: undefined,
        };
        writeTasks(ws.path, ticket.id, taskItems);
      }

      this.broadcast("task:updated", {
        workspaceId,
        ticketId: ticket.id,
        taskId,
        status: "done",
        result: content,
      });

      await this.dispatchStepEvent("taskPostRun", workspaceId, ticket.id, "implement", { taskId, result: content });

      if (resumeQueue) {
        await this.processTasks(workspaceId, ticket);
      }
    } catch (e: any) {
      if (e.name === "StopError") {
        const items = readTasks(ws.path, ticket.id) ?? [];
        const errIdx = items.findIndex((t) => t.id === taskId);
        if (errIdx !== -1) {
          items[errIdx] = { ...items[errIdx], status: "pending" as const, errorMessage: undefined, thoughts: undefined };
          writeTasks(ws.path, ticket.id, items);
        }
        throw e;
      }
      const items = readTasks(ws.path, ticket.id) ?? [];
      const errIdx = items.findIndex((t) => t.id === taskId);
      if (errIdx !== -1) {
        items[errIdx] = {
          ...items[errIdx],
          status: "error",
          errorMessage: e.message || String(e),
          thoughts: undefined,
        };
        writeTasks(ws.path, ticket.id, items);
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
        taskId,
        status: "error",
        error: e.message || String(e),
      });
      this.broadcast("ticket:error", {
        workspaceId,
        ticketId: ticket.id,
        step: "implement",
        error: e.message || String(e),
      });
      await this.dispatchStepEvent("taskError", workspaceId, ticket.id, "implement", { taskId, error: e.message || String(e) });
      await this.dispatchStepEvent("ticketError", workspaceId, ticket.id, "implement", { error: e.message || String(e) });
      throw e;
    } finally {
      inFlight.delete(taskId);
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

  private async advanceTicketStep(workspaceId: string, ticketId: string, trigger: "approve" | "advance") {
    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket) throw new Error("Ticket not found");

    const ws = this.workspaces.get(workspaceId);
    const completedStep = ticket.step as WorkflowStep;

    const preApproveEvent = `preApprove${this.capitalize(completedStep)}` as IntegrationEventName;
    const preApprovePaused = await this.dispatchStepEvent(preApproveEvent, workspaceId, ticketId, completedStep);
    if (preApprovePaused) {
      await db
        .update(tickets)
        .set({ state: "awaiting_actions", status: "pending", pendingEvent: preApproveEvent, resumeTarget: trigger, updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
      return db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    }

    const newStep = nextStep(completedStep);
    if (completedStep === "implement" && !(await this.canAdvanceFromImplement(workspaceId, ticketId))) {
      throw new Error("Cannot advance: tasks have errors");
    }
    if (ws) writeTicketState(ws.path, ticketId, { errorStep: null, errorMessage: null });
    await db
      .update(tickets)
      .set({ step: newStep, state: "idle", status: newStep === "done" ? "done" : "pending", pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));

    this.broadcast(trigger === "approve" ? "ticket:approved" : "ticket:advanced", { workspaceId, ticketId, newStep });

    const postApproveEvent = `postApprove${this.capitalize(completedStep)}` as IntegrationEventName;
    const postApprovePaused = await this.dispatchStepEvent(postApproveEvent, workspaceId, ticketId, completedStep, { newStep });
    if (postApprovePaused) {
      await db
        .update(tickets)
        .set({ step: newStep, state: "awaiting_actions", status: "pending", pendingEvent: postApproveEvent, resumeTarget: trigger, updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));
      return db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    }

    await this.dispatchStepEvent(trigger === "approve" ? "ticketApproved" : "ticketAdvanced", workspaceId, ticketId, completedStep, { newStep });
    if (newStep !== "done") {
      this.runTicket(workspaceId, ticketId).catch(() => {});
    }
    return db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  }

  async approveTicket(workspaceId: string, ticketId: string) {
    return this.advanceTicketStep(workspaceId, ticketId, "approve");
  }

  async advanceTicket(workspaceId: string, ticketId: string) {
    return this.advanceTicketStep(workspaceId, ticketId, "advance");
  }

  async resumeTicket(workspaceId: string, ticketId: string) {
    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
    if (!ticket || ticket.state !== "awaiting_actions") return;

    await db
      .update(tickets)
      .set({ state: "running", status: "in_progress", pendingEvent: null, resumeTarget: null, updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
    this.broadcast("ticket:running", { workspaceId, ticketId });

    const target = ticket.resumeTarget ?? "processStep";
    if (target === "processTasks") {
      await this.processTasks(workspaceId, ticket as any);
    } else if (target === "approve") {
      await this.approveTicket(workspaceId, ticketId);
    } else if (target === "advance") {
      await this.advanceTicket(workspaceId, ticketId);
    } else {
      await this.processStep(workspaceId, ticket as any);
    }
  }

  private async dispatchStepEvent(
    event: IntegrationEventName,
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep,
    extra?: Record<string, unknown>
  ): Promise<boolean> {
    const db = this.getDb(workspaceId);
    if (this.dispatcher) {
      await this.dispatcher.dispatch(event, { workspaceId, ticketId, step, ...extra });
    }
    if (!this.actionTriggerService) return false;

    const existing = await db.query.eventActionLinkages.findMany({
      where: and(
        eq(eventActionLinkages.ticketId, ticketId),
        eq(eventActionLinkages.event, event)
      ),
    });

    if (existing.length > 0) {
      if (existing.some((l) => l.status === "pending")) {
        return true;
      }
      if (existing.some((l) => l.status === "error")) {
        await db
          .update(tickets)
          .set({ state: "error", status: "error", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticketId));
        return true;
      }
      return false;
    }

    const paused = await this.actionTriggerService.onEvent(event, { workspaceId, ticketId, step });
    return paused;
  }

  private parseTasks(content: string): Array<{ title: string; description: string; done: boolean }> {
    const lines = content.split("\n");
    const tasks: Array<{ title: string; description: string; done: boolean }> = [];
    let current: { title: string; descriptionLines: string[]; done: boolean } | null = null;

    const flush = () => {
      if (current) {
        const description = current.descriptionLines.join("\n").trim();
        tasks.push({
          title: current.title,
          description: description || current.title,
          done: current.done,
        });
        current = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      const match = trimmed.match(/^[-*]\s+\[([ xX])\]\s*(.*)/);
      if (match) {
        flush();
        current = {
          title: match[2].trim(),
          descriptionLines: [],
          done: match[1].toLowerCase() === "x",
        };
      } else if (current && line.startsWith("  ")) {
        current.descriptionLines.push(line.trimStart());
      } else if (current && trimmed === "") {
        current.descriptionLines.push("");
      } else {
        flush();
      }
    }
    flush();

    return tasks.filter((t) => t.title.length > 0);
  }
}
