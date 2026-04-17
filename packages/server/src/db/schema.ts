import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("spec"),
  currentStep: text("current_step"),
  pendingEvent: text("pending_event"),
  resumeTarget: text("resume_target"),
  externalSource: text("external_source"),
  externalSourceId: text("external_source_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const eventActionLinkages = sqliteTable("event_action_linkages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  ticketId: text("ticket_id").notNull(),
  event: text("event").notNull(),
  actionRunId: text("action_run_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
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

export const stepRuns = sqliteTable("step_runs", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  step: text("step").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationMs: integer("duration_ms"),
  modelId: text("model_id"),
  status: text("status").notNull().default("running"),
  createdAt: text("created_at").notNull(),
});
