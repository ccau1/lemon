import type { WorkflowStep } from "@lemon/shared";
import { readThread, appendThreadMessages as appendToFile, type ThreadMessage as FileThreadMessage } from "./file-sync.js";

export type ThreadMessage = FileThreadMessage;

export async function getThreadMessages(
  workspacePath: string,
  ticketId: string,
  modelId?: string,
  step?: WorkflowStep
): Promise<ThreadMessage[]> {
  let messages = readThread(workspacePath, ticketId);
  if (modelId) {
    messages = messages.filter((m) => m.modelId === modelId);
  }
  if (step) {
    messages = messages.filter((m) => m.step === step);
  }
  return messages;
}

export async function appendThreadMessages(
  workspacePath: string,
  ticketId: string,
  messages: ThreadMessage[]
): Promise<void> {
  appendToFile(workspacePath, ticketId, messages);
}
