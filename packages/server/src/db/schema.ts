import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("spec"),
  errorStep: text("error_step"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const specs = sqliteTable("specs", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  content: text("content").notNull(),
  outdated: integer("outdated", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  description: text("description").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  comment: text("comment"),
  outdated: integer("outdated", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("queued"),
  errorMessage: text("error_message"),
  result: text("result"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const implementations = sqliteTable("implementations", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  content: text("content").notNull(),
  outdated: integer("outdated", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const actionRuns = sqliteTable("action_runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  actionName: text("action_name").notNull(),
  ticketId: text("ticket_id"),
  status: text("status").notNull().default("pending"),
  response: text("response").notNull(),
  createdAt: text("created_at").notNull(),
});

export const ticketThreads = sqliteTable("ticket_threads", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  modelId: text("model_id").notNull(),
  step: text("step").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const stepModelOverrides = sqliteTable("step_model_overrides", {
  projectId: text("project_id").notNull(),
  step: text("step").notNull(),
  modelId: text("model_id").notNull(),
});
