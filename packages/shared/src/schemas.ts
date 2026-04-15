import { z } from "zod";

export const actionMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const workflowStepSchema = z.enum([
  "spec",
  "plan",
  "tasks",
  "implement",
  "done",
]);

export const ticketStatusSchema = z.enum([
  "spec",
  "plan",
  "tasks",
  "implement",
  "done",
  "awaiting_review",
  "queued",
  "error",
]);

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ticketSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string(),
  status: ticketStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

export const createProjectSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
});

export const createTicketSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string(),
});

export const modelConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["openai", "anthropic", "openai-compatible", "claude-code-cli", "kimi-code-cli", "ollama", "qwen", "gemini"]),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  modelId: z.string(),
  temperature: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const settingsSchema = z.object({
  actions: z.record(z.string(), z.array(actionMessageSchema)).default({}),
  autoApprove: z.object({
    spec: z.boolean().default(false),
    plan: z.boolean().default(false),
    tasks: z.boolean().default(false),
    implement: z.boolean().default(false),
    done: z.boolean().default(false),
  }),
  defaultModels: z.object({
    spec: z.string().optional(),
    plan: z.string().optional(),
    tasks: z.string().optional(),
    implement: z.string().optional(),
    done: z.string().optional(),
  }).default({}),
  parallelConcurrency: z.number().default(3),
  contextGlobs: z.union([
    z.array(z.string()),
    z.record(z.string(), z.array(z.string())),
  ]).default({
    default: ["README.md", "docs/**/*.md", "package.json", "Cargo.toml", "pyproject.toml", "*.config.*"],
  }),
  theme: z.string().default("dark"),
});
