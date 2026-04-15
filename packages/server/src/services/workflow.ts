import PQueue from "p-queue";
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { tickets, specs, plans, tasks, implementations } from "../db/schema.js";
import type { LlmService } from "./llm.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { WorkflowStep } from "@lemon/shared";
import { scanWorkspaceContext } from "./context-scanner.js";
import { syncTicketArtifact } from "./file-sync.js";

const stepOrder: WorkflowStep[] = ["spec", "plan", "tasks", "implement", "done"];

function nextStep(current: WorkflowStep): WorkflowStep {
  const idx = stepOrder.indexOf(current);
  return stepOrder[Math.min(idx + 1, stepOrder.length - 1)];
}

export type BroadcastFn = (event: string, payload: unknown) => void;

export class WorkflowEngine {
  private queues = new Map<string, PQueue>();

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

  async queueTicket(workspaceId: string, ticketId: string) {
    const db = this.getDb(workspaceId);
    await db
      .update(tickets)
      .set({ status: "queued", updatedAt: new Date().toISOString() })
      .where(eq(tickets.id, ticketId));
    this.broadcast("ticket:queued", { workspaceId, ticketId });
  }

  async runTicket(workspaceId: string, ticketId: string) {
    const db = this.getDb(workspaceId);
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });
    if (!ticket) throw new Error("Ticket not found");

    const queue = this.getQueue(workspaceId);
    return queue.add(async () => {
      this.broadcast("ticket:running", { workspaceId, ticketId });
      try {
        await this.processStep(workspaceId, ticket);
      } catch (e: any) {
        await db
          .update(tickets)
          .set({ status: "error", updatedAt: new Date().toISOString() })
          .where(eq(tickets.id, ticketId));
        this.broadcast("ticket:error", {
          workspaceId,
          ticketId,
          error: e.message,
        });
      }
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
      await Promise.all(queued.map((t) => this.runTicket(wsId, t.id)));
    }
  }

  private async processStep(
    workspaceId: string,
    ticket: { id: string; projectId: string; title: string; description: string; status: string }
  ) {
    const db = this.getDb(workspaceId);
    const step = ticket.status as WorkflowStep | "queued" | "awaiting_review" | "error";

    if (step === "done") return;
    if (step === "error") return;

    // Normalize step if queued or awaiting_review back to actual workflow step
    // We need to know the current workflow step. For simplicity, if queued we derive from existing data.
    let currentStep: WorkflowStep = step as WorkflowStep;
    if (step === "queued" || step === "awaiting_review") {
      currentStep = await this.deriveCurrentStep(workspaceId, ticket.id);
    }

    const settings = this.config.resolve(workspaceId);
    const autoApprove = settings.autoApprove[currentStep] ?? false;

    // Always generate the artifact for the current step
    await this.generateAndSave(workspaceId, ticket, currentStep);

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

    // If not done and auto-approve for next step is also true, continue processing
    if (newStep !== "done" && settings.autoApprove[newStep]) {
      const updated = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticket.id),
      });
      if (updated) {
        await this.processStep(workspaceId, updated as any);
      }
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
    if (implRows.length) return "done";
    if (taskRows.length) return "implement";
    if (planRows.length) return "tasks";
    if (specRows.length) return "plan";
    return "spec";
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
    const messages = this.buildPrompt(step, ticket.title, ticket.description, context);
    let content = await this.llm.chat(model, messages);
    content = this.stripPreamble(content);

    const now = new Date().toISOString();

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
        await db.delete(tasks).where(eq(tasks.ticketId, ticket.id));
        for (const t of taskList) {
          await db.insert(tasks).values({
            id: crypto.randomUUID(),
            ticketId: ticket.id,
            description: t.description,
            done: t.done,
            createdAt: now,
            updatedAt: now,
          });
        }
        break;
      }
      case "implement": {
        await db.delete(implementations).where(eq(implementations.ticketId, ticket.id));
        await db.insert(implementations).values({
          id: crypto.randomUUID(),
          ticketId: ticket.id,
          content,
          createdAt: now,
          updatedAt: now,
        });
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

    const specRows = await db.select().from(specs).where(eq(specs.ticketId, ticketId));
    if (specRows[0]) context += `\n\nSpec:\n${specRows[0].content}`;
    if (step === "plan" || step === "tasks" || step === "implement") {
      const planRows = await db.select().from(plans).where(eq(plans.ticketId, ticketId));
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

  private buildPrompt(
    step: WorkflowStep,
    title: string,
    description: string,
    context: string
  ): Array<{ role: "system" | "user"; content: string }> {
    const ticketLine = description.trim()
      ? `Ticket: ${title}\nDescription: ${description}`
      : `Ticket: ${title}`;
    switch (step) {
      case "spec":
        return [
          {
            role: "system",
            content:
              "You are an expert product manager. Write a clear, concise product spec in markdown. Use the provided workspace context (README, docs, config files) to keep the spec realistic for the existing codebase. Do not include preamble like 'Here is the final spec:'; output only the markdown.",
          },
          { role: "user", content: `${ticketLine}${context}\n\nWrite the spec.` },
        ];
      case "plan":
        return [
          {
            role: "system",
            content:
              "You are a senior software architect. Given a spec, write a high-level implementation plan in markdown. Do not include preamble like 'Here is the plan:'; output only the markdown.",
          },
          { role: "user", content: `${ticketLine}${context}\n\nWrite the plan.` },
        ];
      case "tasks":
        return [
          {
            role: "system",
            content:
              'You are a project manager. Given a plan, break it into a list of implementation tasks. Return ONLY a JSON array like [{"description":"...","done":false}, ...].',
          },
          { role: "user", content: `${ticketLine}${context}\n\nWrite the tasks as JSON.` },
        ];
      case "implement":
        return [
          {
            role: "system",
            content:
              "You are a senior engineer. Given the tasks, describe the implementation approach, key code changes, and file names in markdown. Do not include preamble like 'Here is the implementation:'; output only the markdown."
          },
          {
            role: "user",
            content: `${ticketLine}${context}\n\nWrite the implementation details.`,
          },
        ];
      default:
        return [];
    }
  }

  private stripPreamble(content: string): string {
    const lines = content.split("\n");
    const startIdx = lines.findIndex((l) =>
      l.trim().startsWith("#") ||
      l.trim().startsWith("-") ||
      l.trim().startsWith("*") ||
      /^\d+\./.test(l.trim()) ||
      l.trim().startsWith("```")
    );
    if (startIdx > 0) return lines.slice(startIdx).join("\n").trim();
    return content.trim();
  }

  private parseTasks(content: string): Array<{ description: string; done: boolean }> {
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json)) {
        return json.map((t: any) => ({
          description: String(t.description ?? ""),
          done: Boolean(t.done ?? false),
        }));
      }
    } catch {
      // fallback: treat each line as a task
      return content
        .split("\n")
        .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
        .filter((l) => l.length > 0)
        .map((l) => ({ description: l, done: false }));
    }
    return [];
  }
}
