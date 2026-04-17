import type { WorkflowStep } from "@lemon/shared";
import { readThread, appendThreadMessages as appendToFile, type ThreadMessage as FileThreadMessage } from "./file-sync.js";

export type ThreadMessage = FileThreadMessage;

export async function getThreadMessages(
  workspacePath: string,
  ticketId: string,
  modelId?: string
): Promise<ThreadMessage[]> {
  const messages = readThread(workspacePath, ticketId);
  if (!modelId) return messages;
  return messages.filter((m) => m.modelId === modelId);
}

export async function appendThreadMessages(
  workspacePath: string,
  ticketId: string,
  messages: ThreadMessage[]
): Promise<void> {
  appendToFile(workspacePath, ticketId, messages);
}
