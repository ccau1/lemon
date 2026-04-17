import fs from "fs";
import path from "path";
import type { WorkflowStep } from "@lemon/shared";

export type TaskItem = {
  id: string;
  description: string;
  done: boolean;
  comment?: string;
  status?: "queued" | "processing" | "done" | "cancelled" | "error";
  errorMessage?: string;
  result?: string;
};

export type ThreadMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  modelId?: string;
  step?: WorkflowStep;
  createdAt?: string;
};

export type TicketState = {
  errorStep?: string | null;
  errorMessage?: string | null;
  forceStep?: WorkflowStep | null;
};

export type TicketConf = {
  autoApprove?: Partial<Record<WorkflowStep, boolean>>;
  triggers?: Record<string, string[]>;
};

const steps: WorkflowStep[] = ["spec", "plan", "tasks", "implement", "done"];

export const stepArtifacts: Record<WorkflowStep, string[]> = {
  spec: ["spec.md"],
  plan: ["plan.md"],
  tasks: ["tasks.json", "tasks.md"],
  implement: ["implement.md"],
  done: [],
};

export function ticketDir(workspacePath: string, ticketId: string): string {
  return path.join(workspacePath, ".lemon", "tickets", ticketId);
}

export function archivedTicketDir(workspacePath: string, ticketId: string): string {
  return path.join(workspacePath, ".lemon", "tickets", `.archived_${ticketId}`);
}

export function isTicketArchived(workspacePath: string, ticketId: string): boolean {
  return fs.existsSync(archivedTicketDir(workspacePath, ticketId));
}

export function ensureTicketDir(workspacePath: string, ticketId: string): string {
  const dir = ticketDir(workspacePath, ticketId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function hasStepArtifact(workspacePath: string, ticketId: string, step: WorkflowStep): boolean {
  return stepArtifacts[step].some((file) => fs.existsSync(path.join(ticketDir(workspacePath, ticketId), file)));
}

export function readStep(workspacePath: string, ticketId: string, step: WorkflowStep): string | null {
  const fileName = step === "tasks" ? "tasks.json" : `${step}.md`;
  const filePath = path.join(ticketDir(workspacePath, ticketId), fileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8");
}

export function writeStep(workspacePath: string, ticketId: string, step: WorkflowStep, content: string): void {
  const dir = ensureTicketDir(workspacePath, ticketId);
  const fileName = step === "tasks" ? "tasks.json" : `${step}.md`;
  fs.writeFileSync(path.join(dir, fileName), content, "utf-8");
}

export function readSpec(workspacePath: string, ticketId: string): string | null {
  return readStep(workspacePath, ticketId, "spec");
}

export function writeSpec(workspacePath: string, ticketId: string, content: string): void {
  writeStep(workspacePath, ticketId, "spec", content);
}

export function readPlan(workspacePath: string, ticketId: string): string | null {
  return readStep(workspacePath, ticketId, "plan");
}

export function writePlan(workspacePath: string, ticketId: string, content: string): void {
  writeStep(workspacePath, ticketId, "plan", content);
}

export function readImplement(workspacePath: string, ticketId: string): string | null {
  return readStep(workspacePath, ticketId, "implement");
}

export function writeImplement(workspacePath: string, ticketId: string, content: string): void {
  writeStep(workspacePath, ticketId, "implement", content);
}

export function readTasks(workspacePath: string, ticketId: string): TaskItem[] | null {
  const raw = readStep(workspacePath, ticketId, "tasks");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TaskItem[];
  } catch {
    return null;
  }
}

export function writeTasks(workspacePath: string, ticketId: string, tasks: TaskItem[]): void {
  writeStep(workspacePath, ticketId, "tasks", JSON.stringify(tasks, null, 2));
  const dir = ensureTicketDir(workspacePath, ticketId);
  const markdown = tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.description}`).join("\n");
  fs.writeFileSync(path.join(dir, "tasks.md"), markdown, "utf-8");
}

export function readThread(workspacePath: string, ticketId: string): ThreadMessage[] {
  const filePath = path.join(ticketDir(workspacePath, ticketId), "thread.jsonl");
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter((l) => l.trim());
  return lines.map((line) => JSON.parse(line) as ThreadMessage);
}

export function appendThreadMessages(
  workspacePath: string,
  ticketId: string,
  messages: ThreadMessage[]
): void {
  const dir = ensureTicketDir(workspacePath, ticketId);
  const filePath = path.join(dir, "thread.jsonl");
  const now = new Date().toISOString();
  const lines = messages.map((m) => JSON.stringify({ ...m, createdAt: m.createdAt ?? now })).join("\n");
  fs.appendFileSync(filePath, lines + "\n", "utf-8");
}

export function deleteThread(workspacePath: string, ticketId: string): void {
  const filePath = path.join(ticketDir(workspacePath, ticketId), "thread.jsonl");
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function removeTicketArtifacts(workspacePath: string, ticketId: string): void {
  const dir = ticketDir(workspacePath, ticketId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function archiveTicket(workspacePath: string, ticketId: string): void {
  const src = ticketDir(workspacePath, ticketId);
  const dst = archivedTicketDir(workspacePath, ticketId);
  if (fs.existsSync(src)) {
    fs.renameSync(src, dst);
  } else {
    // ensure archived dir exists even if there were no artifacts
    fs.mkdirSync(dst, { recursive: true });
  }
}

export function unarchiveTicket(workspacePath: string, ticketId: string): void {
  const src = archivedTicketDir(workspacePath, ticketId);
  const dst = ticketDir(workspacePath, ticketId);
  if (fs.existsSync(src)) {
    fs.renameSync(src, dst);
  }
}

export function listTicketArtifactSteps(workspacePath: string, ticketId: string): WorkflowStep[] {
  const dir = ticketDir(workspacePath, ticketId);
  if (!fs.existsSync(dir)) return [];
  return steps.filter((s) => stepArtifacts[s].some((file) => fs.existsSync(path.join(dir, file))));
}

export function deriveCurrentStep(workspacePath: string, ticketId: string): WorkflowStep {
  const existing = listTicketArtifactSteps(workspacePath, ticketId);
  if (existing.includes("implement")) return "implement";
  if (existing.includes("tasks")) return "tasks";
  if (existing.includes("plan")) return "plan";
  if (existing.includes("spec")) return "spec";
  return "spec";
}

export function clearDownstreamArtifacts(
  workspacePath: string,
  ticketId: string,
  step: WorkflowStep
): void {
  const dir = ticketDir(workspacePath, ticketId);
  if (!fs.existsSync(dir)) return;
  const stepIdx = steps.indexOf(step);
  const toDelete = steps.slice(stepIdx + 1).flatMap((s) => stepArtifacts[s]);
  for (const file of toDelete) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

export function readTicketState(workspacePath: string, ticketId: string): TicketState {
  const filePath = path.join(ticketDir(workspacePath, ticketId), ".lmstate");
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as TicketState;
  } catch {
    return {};
  }
}

export function writeTicketState(workspacePath: string, ticketId: string, state: TicketState): void {
  const dir = ensureTicketDir(workspacePath, ticketId);
  fs.writeFileSync(path.join(dir, ".lmstate"), JSON.stringify(state, null, 2), "utf-8");
}

export function readTicketConf(workspacePath: string, ticketId: string): TicketConf {
  const filePath = path.join(ticketDir(workspacePath, ticketId), ".conf");
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as TicketConf;
  } catch {
    return {};
  }
}

export function writeTicketConf(workspacePath: string, ticketId: string, conf: TicketConf): void {
  const dir = ensureTicketDir(workspacePath, ticketId);
  fs.writeFileSync(path.join(dir, ".conf"), JSON.stringify(conf, null, 2), "utf-8");
}

// Legacy resync helper — now a no-op because files are the source of truth.
// Kept in the API to minimise churn in call sites.
export async function resyncTicketArtifacts(
  _db: unknown,
  _workspacePath: string,
  _ticketId: string
): Promise<void> {
  // no-op
}
