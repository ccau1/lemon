import { eq, asc } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { ticketThreads } from "../db/schema.js";
import type { WorkflowStep } from "@lemon/shared";

export type ThreadMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function getThreadMessages(
  db: DB,
  ticketId: string,
  modelId: string
): Promise<ThreadMessage[]> {
  const rows = await db
    .select()
    .from(ticketThreads)
    .where(eq(ticketThreads.ticketId, ticketId))
    .orderBy(asc(ticketThreads.createdAt));
  return rows
    .filter((r) => r.modelId === modelId)
    .map((r) => ({
      role: r.role as ThreadMessage["role"],
      content: r.content,
    }));
}

export async function appendThreadMessages(
  db: DB,
  ticketId: string,
  modelId: string,
  step: WorkflowStep,
  messages: ThreadMessage[]
): Promise<void> {
  const now = new Date().toISOString();
  for (const m of messages) {
    await db.insert(ticketThreads).values({
      id: crypto.randomUUID(),
      ticketId,
      modelId,
      step,
      role: m.role,
      content: m.content,
      createdAt: now,
    });
  }
}
