import { eq, and } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { actionRuns, eventActionLinkages, tickets } from "../db/schema.js";
import type { ConfigManager } from "../config/settings.js";
import type { ActionRunQueue } from "./action-run-queue.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import { readTicketConf } from "./file-sync.js";

export class ActionTriggerService {
  constructor(
    private getDb: (workspaceId: string) => DB,
    private configManager: ConfigManager,
    private actionRunQueue: ActionRunQueue,
    private workspaces: WorkspaceRegistry,
    private resumeTicket: (workspaceId: string, ticketId: string) => Promise<void>
  ) {}

  async onEvent(
    event: string,
    ctx: { workspaceId: string; ticketId: string; step?: string }
  ): Promise<boolean> {
    const db = this.getDb(ctx.workspaceId);
    const settings = this.configManager.resolve(ctx.workspaceId);
    const ws = this.workspaces.get(ctx.workspaceId);

    // Merge triggers from workspace settings and ticket-level conf
    const actionNames = new Set<string>();
    for (const name of settings.triggers?.[event] ?? []) {
      actionNames.add(name);
    }
    if (ws) {
      const conf = readTicketConf(ws.path, ctx.ticketId);
      for (const name of conf.triggers?.[event] ?? []) {
        actionNames.add(name);
      }
    }

    if (actionNames.size === 0) return false;

    const actions = settings.actions ?? {};
    const now = new Date().toISOString();
    let created = 0;

    for (const actionName of actionNames) {
      const messages = actions[actionName];
      if (!messages) {
        console.warn(
          `[ActionTriggerService] Action "${actionName}" not found for event ${event}`
        );
        continue;
      }

      const run = await this.actionRunQueue.enqueue({
        workspaceId: ctx.workspaceId,
        actionName,
        ticketId: ctx.ticketId,
        messages,
      });

      await db.insert(eventActionLinkages).values({
        id: crypto.randomUUID(),
        workspaceId: ctx.workspaceId,
        ticketId: ctx.ticketId,
        event,
        actionRunId: run.id,
        status: "pending",
        createdAt: now,
      });
      created++;
    }

    return created > 0;
  }

  async onActionRunComplete(
    workspaceId: string,
    actionRunId: string
  ): Promise<void> {
    const db = this.getDb(workspaceId);
    const linkage = await db.query.eventActionLinkages.findFirst({
      where: eq(eventActionLinkages.actionRunId, actionRunId),
    });
    if (!linkage) return;

    const run = await db.query.actionRuns.findFirst({
      where: eq(actionRuns.id, actionRunId),
    });
    if (!run) return;

    await db
      .update(eventActionLinkages)
      .set({ status: run.status === "done" ? "done" : "error" })
      .where(eq(eventActionLinkages.id, linkage.id));

    const pending = await db.query.eventActionLinkages.findMany({
      where: and(
        eq(eventActionLinkages.ticketId, linkage.ticketId),
        eq(eventActionLinkages.event, linkage.event),
        eq(eventActionLinkages.status, "pending")
      ),
    });

    if (pending.length > 0) return;

    const allLinkages = await db.query.eventActionLinkages.findMany({
      where: and(
        eq(eventActionLinkages.ticketId, linkage.ticketId),
        eq(eventActionLinkages.event, linkage.event)
      ),
    });

    const hasError = allLinkages.some((l) => l.status === "error");
    if (hasError) {
      await db
        .update(tickets)
        .set({
          status: "error",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tickets.id, linkage.ticketId));
      return;
    }

    await this.resumeTicket(workspaceId, linkage.ticketId);
  }

  async recoverTickets(): Promise<void> {
    for (const ws of this.workspaces.list()) {
      const db = this.getDb(ws.id);
      const stuckTickets = await db.query.tickets.findMany({
        where: eq(tickets.status, "awaiting_actions"),
      });

      for (const ticket of stuckTickets) {
        const pending = await db.query.eventActionLinkages.findMany({
          where: and(
            eq(eventActionLinkages.ticketId, ticket.id),
            eq(eventActionLinkages.status, "pending")
          ),
        });

        if (pending.length > 0) continue;

        const allLinkages = await db.query.eventActionLinkages.findMany({
          where: eq(eventActionLinkages.ticketId, ticket.id),
        });

        const hasError = allLinkages.some((l) => l.status === "error");
        if (hasError) {
          await db
            .update(tickets)
            .set({
              status: "error",
              updatedAt: new Date().toISOString(),
            })
            .where(eq(tickets.id, ticket.id));
          continue;
        }

        await this.resumeTicket(ws.id, ticket.id);
      }
    }
  }
}
