// Step-specific lifecycle events
// Format: {phase}{action}{StepName}
// phases: pre, post
// actions: Run, Approve
// steps: Spec, Plan, Tasks, Implement, Done

export const integrationEvents = [
  "preRunSpec",
  "postRunSpec",
  "preApproveSpec",
  "postApproveSpec",

  "preRunPlan",
  "postRunPlan",
  "preApprovePlan",
  "postApprovePlan",

  "preRunTasks",
  "postRunTasks",
  "preApproveTasks",
  "postApproveTasks",

  "preRunImplement",
  "postRunImplement",
  "preApproveImplement",
  "postApproveImplement",

  "preRunDone",
  "postRunDone",
  "preApproveDone",
  "postApproveDone",

  // Ticket lifecycle
  "ticketCreated",
  "ticketUpdated",
  "ticketAdvanced",
  "ticketApproved",
  "ticketRejected",
  "ticketBacked",
  "ticketQueued",
  "ticketRunning",
  "ticketAwaitingReview",
  "ticketError",
  "ticketBatchStarted",

  // Task lifecycle
  "taskPreRun",
  "taskPostRun",
  "taskUpdated",
  "taskError",
] as const;

export type IntegrationEventName = (typeof integrationEvents)[number];

export interface IntegrationEventPayload {
  workspaceId: string;
  ticketId: string;
  step?: string;
  error?: string;
  result?: string;
  taskId?: string;
  count?: number;
  [key: string]: unknown;
}
