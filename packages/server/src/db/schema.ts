import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("spec"),
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
