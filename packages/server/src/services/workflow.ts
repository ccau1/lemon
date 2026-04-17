import PQueue from "p-queue";
import { eq, asc, desc } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { tickets, specs, plans, tasks, implementations } from "../db/schema.js";
import type { LlmService } from "./llm.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { WorkflowStep } from "@lemon/shared";
import { scanWorkspaceContext } from "./context-scanner.js";
import { syncTicketArtifact } from "./file-sync.js";
import { getThreadMessages, appendThreadMessages, type ThreadMessage } from "./thread.js";

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

export class WorkflowEngine {
  private queues = new Map<string, PQueue>();
  private running = new Map<string, Set<string>>();

  constructor(
    private getDb: (workspaceId: string) => DB,
    private llm: LlmService,
    private config: ConfigManager,
    private broadcast: BroadcastFn,
    private workspaces: WorkspaceRegistry
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

    running.add(ticketId);
    const queue = this.getQueue(workspaceId);
    return queue
      .add(async () => {
        this.broadcast("ticket:running", { workspaceId, ticketId });
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
          // This will be improved when we inject workspace registry
          return [workspaceId];
        })()
      : [workspaceId];

    for (const wsId of targetWorkspaces) {
      const db = this.getDb(wsId);
      const queued = await db.select().from(tickets).where(eq(tickets.status, "queued"));
      this.broadcast("ticket:batch_started", {
        workspaceId: wsId,
        count: queued.length,
      });
      await Promise.allSettled(queued.map((t) => this.runTicket(wsId, t.id)));
    }
  }

  private async processStep(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string; status: string }
  ) {
    const db = this.getDb(workspaceId);
    const step = ticket.status as WorkflowStep | "queued" | "awaiting_review" | "error";

    if (step === "done") return;

    // Normalize step if queued, awaiting_review, or error back to actual workflow step
    let currentStep: WorkflowStep = step as WorkflowStep;
    if (step === "queued" || step === "awaiting_review" || step === "error") {
      if (step === "error" && (ticket as any).errorStep) {
        currentStep = (ticket as any).errorStep as WorkflowStep;
      } else {
        currentStep = await this.deriveCurrentStep(workspaceId, ticket.id);
      }
    }

    try {
      await db
        .update(tickets)
        .set({ errorStep: null, errorMessage: null })
        .where(eq(tickets.id, ticket.id));

      const settings = this.config.resolve(workspaceId);
      const autoApprove = settings.autoApprove[currentStep] ?? false;

      const shouldSkipGeneration = await this.hasNonOutdatedArtifact(workspaceId, ticket.id, currentStep);
      if (!shouldSkipGeneration) {
        await this.generateAndSave(workspaceId, ticket, currentStep);
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
        return;
      }

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
          errorStep: currentStep,
          errorMessage: e.message || String(e),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tickets.id, ticket.id));
      this.broadcast("ticket:error", {
        workspaceId,
        ticketId: ticket.id,
        step: currentStep,
        error: e.message || String(e),
      });
      throw e;
    }
  }

  private async deriveCurrentStep(
    workspaceId: string,
    ticketId: string
  ): Promise<WorkflowStep> {
    const db = this.getDb(workspaceId);
    const [specRows, planRows, taskRows, implRows] = await Promise.all([
      db.select().from(specs).where(eq(specs.ticketId, ticketId)),
      db.select().from(plans).where(eq(plans.ticketId, ticketId)),
      db.select().from(tasks).where(eq(tasks.ticketId, ticketId)),
      db.select().from(implementations).where(eq(implementations.ticketId, ticketId)),
    ]);
    const hasImpl = implRows.some((r) => !r.outdated);
    const hasTasks = taskRows.some((r) => !r.outdated);
    const hasPlan = planRows.some((r) => !r.outdated);
    const hasSpec = specRows.length > 0;
    if (hasImpl) return "implement";
    if (hasTasks) return "tasks";
    if (hasPlan) return "plan";
    if (hasSpec) return "spec";
    return "spec";
  }

  private async hasNonOutdatedArtifact(
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep
  ): Promise<boolean> {
    const db = this.getDb(workspaceId);
    switch (step) {
      case "spec": {
        const rows = await db.select().from(specs).where(eq(specs.ticketId, ticketId));
        return rows.length > 0;
      }
      case "plan": {
        const rows = await db.select().from(plans).where(eq(plans.ticketId, ticketId));
        return rows.length > 0 && rows.some((r) => !r.outdated);
      }
      case "tasks": {
        const rows = await db.select().from(tasks).where(eq(tasks.ticketId, ticketId));
        return rows.length > 0 && rows.every((r) => !r.outdated);
      }
      case "implement": {
        return false;
      }
      default:
        return false;
    }
  }

  private async generateAndSave(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string },
    step: WorkflowStep
  ) {
    const db = this.getDb(workspaceId);
    const model = await this.llm.resolveModel(
      workspaceId,
      ticket.projectId,
      step,
      db
    );
    if (!model) throw new Error(`No model configured for step ${step}`);

    const context = await this.buildContext(workspaceId, ticket.id, step);
    const messages = this.buildPrompt(workspaceId, step, ticket.title, ticket.description, context);
    const threadMessages = await getThreadMessages(db, ticket.id, model.id);
    const allMessages: ThreadMessage[] = [...threadMessages, ...messages];
    let content = await this.llm.chat(model, allMessages);
    content = this.stripPreamble(content);
    await appendThreadMessages(db, ticket.id, model.id, step, [
      ...messages,
      { role: "assistant", content },
    ]);

    const now = new Date().toISOString();

    // Clear downstream artifacts when regenerating an upstream step
    if (step === "spec" || step === "plan" || step === "tasks") {
      await db.delete(implementations).where(eq(implementations.ticketId, ticket.id));
    }
    if (step === "spec" || step === "plan") {
      await db.delete(tasks).where(eq(tasks.ticketId, ticket.id));
    }
    if (step === "spec") {
      await db.delete(plans).where(eq(plans.ticketId, ticket.id));
    }

    switch (step) {
      case "spec": {
        await db.delete(specs).where(eq(specs.ticketId, ticket.id));
        await db.insert(specs).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          content,
          createdAt: now,
          updatedAt: now,
        });
        break;
      }
      case "plan": {
        await db.delete(plans).where(eq(plans.ticketId, ticket.id));
        await db.insert(plans).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          content,
          createdAt: now,
          updatedAt: now,
        });
        break;
      }
      case "tasks": {
        const taskList = this.parseTasks(content);
        if (taskList.length === 0) {
          throw new Error("LLM returned empty or unparseable task list");
        }
        await db.delete(tasks).where(eq(tasks.ticketId, ticket.id));
        for (const t of taskList) {
          await db.insert(tasks).values({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            description: t.description,
            done: t.done,
            comment: null,
            status: "queued",
            createdAt: now,
            updatedAt: now,
          });
        }
        break;
      }
      case "implement": {
        await this.processTasks(workspaceId, ticket);
        break;
      }
    }

    const workspace = this.workspaces.get(workspaceId);
    if (workspace && step !== "done") {
      if (step === "tasks") {
        syncTicketArtifact(workspace.path, ticket.id, step, this.parseTasks(content));
      } else {
        syncTicketArtifact(workspace.path, ticket.id, step, content);
      }
    }
  }

  private async buildContext(
    workspaceId: string,
    ticketId: string,
    step: WorkflowStep
  ): Promise<string> {
    const db = this.getDb(workspaceId);
    let context = "";

    if (step === "spec" || step === "plan" || step === "tasks" || step === "implement") {
      const workspace = this.workspaces.get(workspaceId);
      if (workspace) {
        const globs = this.config.resolveContextGlobs(workspaceId, step);
        const workspaceContext = await scanWorkspaceContext({
          workspacePath: workspace.path,
          globs,
        });
        context += workspaceContext;
      }
    }

    const specRows = await db.select().from(specs).where(eq(specs.ticketId, ticketId)).orderBy(desc(specs.createdAt));
    if (specRows[0]) context += `\n\nSpec:\n${specRows[0].content}`;
    if (step === "plan" || step === "tasks" || step === "implement") {
      const planRows = await db.select().from(plans).where(eq(plans.ticketId, ticketId)).orderBy(desc(plans.createdAt));
      if (planRows[0]) context += `\n\nPlan:\n${planRows[0].content}`;
    }
    if (step === "tasks" || step === "implement") {
      const taskRows = await db.select().from(tasks).where(eq(tasks.ticketId, ticketId));
      if (taskRows.length) {
        context += `\n\nTasks:\n${taskRows.map((t) => `- ${t.description}`).join("\n")}`;
      }
    }
    return context;
  }

  private defaultPrompts: Record<WorkflowStep, string> = {
    spec: "You are an expert product manager. Write a clear, concise product spec in markdown. Use the following sections with ATX headings: # Title, ## Overview, ## In Scope, ## Out of Scope, ## Technical Requirements, ## File Structure, ## Acceptance Criteria. Use bullet lists under each section. Wrap file trees in triple backticks. Use the provided workspace context (README, docs, config files) to keep the spec realistic for the existing codebase. Do not include preamble like 'Here is the final spec:'; output only the markdown.",
    plan: "You are a senior software architect. Given a spec, write a high-level implementation plan in markdown. Use the following sections with ATX headings: # Title, ## Overview, ## Key Files / Changes, ## Step-by-step Implementation, ## Testing Strategy, ## Risks and Considerations. Use bullet lists and numbered lists where appropriate. Wrap file trees or code snippets in triple backticks. Do not include preamble like 'Here is the plan:'; output only the markdown.",
    tasks: 'You are a project manager. Given a plan, break it into a list of implementation tasks. Return ONLY a JSON array like [{"description":"...","done":false}, ...].',
    implement: "You are a senior engineer. Given the tasks, describe the implementation approach, key code changes, and file names in markdown. Do not include preamble like 'Here is the implementation:'; output only the markdown.",
    done: "",
  };

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
    const systemContent = (configured && configured.trim()) || this.defaultPrompts[step];
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
    const taskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.ticketId, ticket.id))
      .orderBy(asc(tasks.createdAt));

    const nextTask = taskRows.find((t) => t.status === "queued");
    if (!nextTask) {
      await db
        .update(tickets)
        .set({ status: "done", updatedAt: new Date().toISOString() })
        .where(eq(tickets.id, ticket.id));
      this.broadcast("ticket:advanced", {
        workspaceId,
        ticketId: ticket.id,
        newStep: "done",
      });
      return;
    }

    await db
      .update(tasks)
      .set({ status: "processing", updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, nextTask.id));
    this.broadcast("task:updated", {
      workspaceId,
      ticketId: ticket.id,
      taskId: nextTask.id,
      status: "processing",
    });

    try {
      const model = await this.llm.resolveModel(
        workspaceId,
        ticket.projectId,
        "implement",
        db
      );
      if (!model) throw new Error("No model configured for implement step");

      const context = await this.buildContext(workspaceId, ticket.id, "implement");
      const messages = this.buildTaskPrompt(
        ticket.title,
        ticket.description,
        nextTask.description,
        context
      );
      const threadMessages = await getThreadMessages(db, ticket.id, model.id);
      const allMessages: ThreadMessage[] = [...threadMessages, ...messages];
      let content = await this.llm.chat(model, allMessages);
      content = this.stripPreamble(content);
      await appendThreadMessages(db, ticket.id, model.id, "implement", [
        ...messages,
        { role: "assistant", content },
      ]);

      await db
        .update(tasks)
        .set({
          status: "done",
          done: true,
          result: content,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tasks.id, nextTask.id));

      this.broadcast("task:updated", {
        workspaceId,
        ticketId: ticket.id,
        taskId: nextTask.id,
        status: "done",
        result: content,
      });

      await this.processTasks(workspaceId, ticket);
    } catch (e: any) {
      await db
        .update(tasks)
        .set({
          status: "error",
          errorMessage: e.message || String(e),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tasks.id, nextTask.id));

      await db
        .update(tickets)
        .set({
          status: "error",
          errorStep: "implement",
          errorMessage: e.message || String(e),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tickets.id, ticket.id));

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
