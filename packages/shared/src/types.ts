export interface ActionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type WorkflowStep = "spec" | "plan" | "tasks" | "implement" | "done";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: WorkflowStep | "awaiting_review" | "queued" | "error";
  errorStep?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Spec {
  id: string;
  ticketId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  ticketId: string;
  content: string;
  outdated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  ticketId: string;
  description: string;
  done: boolean;
  comment?: string;
  outdated?: boolean;
  status?: "queued" | "processing" | "done" | "cancelled" | "error";
  errorMessage?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Implementation {
  id: string;
  ticketId: string;
  content: string;
  outdated?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "openai-compatible" | "claude-code-cli" | "kimi-code-cli" | "ollama" | "qwen" | "gemini";
  baseUrl?: string;
  apiKey?: string;
  modelId: string;
  temperature?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StepModelOverride {
  projectId: string;
  step: WorkflowStep;
  modelId: string;
}

export interface SectionChatRequest {
  step: WorkflowStep;
  fullContent: string;
  sectionContent: string;
  messages: ActionMessage[];
}

export interface Settings {
  actions: Record<string, ActionMessage[]>;
  autoApprove: Record<WorkflowStep, boolean>;
  defaultModels: Partial<Record<WorkflowStep, string>>;
  prompts: Partial<Record<WorkflowStep, string>>;
  parallelConcurrency: number;
  contextGlobs: string[] | Record<string, string[]>;
  theme: string;
}
