import PQueue from "p-queue";
import { eq, or } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { actionRuns } from "../db/schema.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { LlmService } from "./llm.js";
import type { ModelRegistry } from "../config/model-registry.js";

export class ActionRunQueue {
  private queues = new Map<string, PQueue>();

  constructor(
    private getDb: (workspaceId: string) => DB,
    private llm: LlmService,
    private configManager: ConfigManager,
    private modelRegistry: ModelRegistry,
    private workspaces: WorkspaceRegistry
  ) {}

  private getQueue(workspaceId: string): PQueue {
    if (!this.queues.has(workspaceId)) {
      const settings = this.configManager.resolve(workspaceId);
      this.queues.set(
        workspaceId,
        new PQueue({ concurrency: settings.parallelConcurrency })
      );
    }
    return this.queues.get(workspaceId)!;
  }

  private schedule(
    db: DB,
    workspaceId: string,
    runId: string,
    messages: any[],
    modelId?: string
  ): void {
    const queue = this.getQueue(workspaceId);
    queue.add(async () => {
      await db
        .update(actionRuns)
        .set({ status: "running" })
        .where(eq(actionRuns.id, runId));

      let model;
      if (modelId) {
        model = this.modelRegistry.get(modelId);
      } else {
        const all = this.modelRegistry.list();
        model = all[0];
      }
      if (!model) {
        await db
          .update(actionRuns)
          .set({ status: "error", response: "No model configured" })
          .where(eq(actionRuns.id, runId));
        return;
      }

      try {
        const workspace = this.workspaces.get(workspaceId);
        const content = await this.llm.chat(model, messages as any, workspace?.path);
        await db
          .update(actionRuns)
          .set({ status: "done", response: content })
          .where(eq(actionRuns.id, runId));
      } catch (err: any) {
        const errorText = err?.message || String(err);
        await db
          .update(actionRuns)
          .set({ status: "error", response: errorText })
          .where(eq(actionRuns.id, runId));
      }
    });
  }

  async enqueue({
    workspaceId,
    actionName,
    ticketId,
    modelId,
    messages,
  }: {
    workspaceId: string;
    actionName: string;
    ticketId?: string;
    modelId?: string;
    messages: any[];
  }): Promise<{ id: string; status: string }> {
    const db = this.getDb(workspaceId);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    await db.insert(actionRuns).values({
      id,
      workspaceId,
      actionName,
      ticketId: ticketId ?? null,
      status: "pending",
      response: "",
      createdAt: now,
    });

    this.schedule(db, workspaceId, id, messages, modelId);
    return { id, status: "pending" };
  }

  async recover(registry: WorkspaceRegistry): Promise<void> {
    for (const ws of registry.list()) {
      const db = this.getDb(ws.id);
      const rows = await db.query.actionRuns.findMany({
        where: (runs, { or, eq }) =>
          or(eq(runs.status, "pending"), eq(runs.status, "running")),
      });

      if (rows.length === 0) continue;

      const actions = this.configManager.resolve(ws.id).actions ?? {};

      for (const row of rows) {
        // If the server crashed while running, reset to pending so it retries
        if (row.status === "running") {
          await db
            .update(actionRuns)
            .set({ status: "pending" })
            .where(eq(actionRuns.id, row.id));
        }

        const messages = actions[row.actionName];
        if (!messages) {
          await db
            .update(actionRuns)
            .set({ status: "error", response: "Action not found on recovery" })
            .where(eq(actionRuns.id, row.id));
          continue;
        }

        this.schedule(db, ws.id, row.id, messages, undefined);
      }
    }
  }
}
