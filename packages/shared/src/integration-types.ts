export type IntegrationFieldType = "text" | "secret" | "textarea" | "number" | "checkbox" | "select" | "multi-select";

export interface IntegrationField {
  name: string;
  label: string;
  type: IntegrationFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  helpText?: string;
}

export interface IntegrationForm {
  fields: IntegrationField[];
}

export interface IntegrationEventHandler {
  event: string;
  handler: (ctx: IntegrationContext) => void | Promise<void>;
}

export interface IntegrationTicketCreate {
  enabled: boolean;
  defaultProjectKey?: string;
  mappings?: Record<string, string>;
}

export interface IntegrationTicketImport {
  enabled: boolean;
}

export interface ExternalTicket {
  id: string;
  title: string;
  description: string;
  url: string;
  labels?: string[];
}

export interface IntegrationDefinition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  form: IntegrationForm;
  onEvents: IntegrationEventHandler[];
  ticketCreate: IntegrationTicketCreate;
  ticketImport: IntegrationTicketImport;

  /**
   * Search remote tickets matching a query string.
   */
  importSearch?: (
    query: string,
    config: Record<string, unknown>
  ) => Promise<ExternalTicket[]>;

  /**
   * Parse a webhook payload into a normalized external ticket.
   */
  importWebhook?: (
    payload: unknown,
    config: Record<string, unknown>
  ) => Promise<ExternalTicket | null>;

  /**
   * Poll for tickets created/updated since a given timestamp.
   */
  importPoll?: (
    since: Date,
    config: Record<string, unknown>
  ) => Promise<ExternalTicket[]>;
}

export interface IntegrationContext {
  workspaceId: string;
  ticketId: string;
  ticket?: {
    id: string;
    projectId: string;
    title: string;
    description: string;
    status: string;
  };
  step?: string;
  config: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface IntegrationConfig {
  id: string;
  type: string;
  enabled: boolean;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
