import type { IntegrationDefinition, IntegrationContext, ExternalTicket } from "../../integration-types.js";

async function importSearch(
  query: string,
  config: Record<string, unknown>
): Promise<ExternalTicket[]> {
  // TODO: implement real Jira search via /rest/api/3/search
  const baseUrl = String(config.baseUrl || "https://example.atlassian.net");
  const projectKey = String(config.projectKey || "PROJ");
  const mock: ExternalTicket[] = [
    {
      id: `${projectKey}-101`,
      title: `${query || "Jira"} issue A`,
      description: "Description for Jira issue A",
      url: `${baseUrl}/browse/${projectKey}-101`,
    },
    {
      id: `${projectKey}-102`,
      title: `${query || "Jira"} issue B`,
      description: "Description for Jira issue B",
      url: `${baseUrl}/browse/${projectKey}-102`,
    },
  ];
  return mock.filter((r) => !query || r.title.toLowerCase().includes(query.toLowerCase()));
}

const jira: IntegrationDefinition = {
  id: "jira",
  name: "Jira",
  description: "Sync tickets with Atlassian Jira",
  form: {
    fields: [
      {
        name: "baseUrl",
        label: "Base URL",
        type: "text",
        required: true,
        placeholder: "https://your-domain.atlassian.net",
        helpText: "Your Jira instance base URL",
      },
      {
        name: "email",
        label: "Email",
        type: "text",
        required: true,
        placeholder: "you@example.com",
        helpText: "The email address of your Atlassian account",
      },
      {
        name: "apiToken",
        label: "API Token",
        type: "secret",
        required: true,
        helpText: "Create an API token from your Atlassian account settings",
      },
      {
        name: "projectKey",
        label: "Project Key",
        type: "text",
        required: true,
        placeholder: "PROJ",
        helpText: "The Jira project key where tickets will be created",
      },
      {
        name: "issueType",
        label: "Issue Type",
        type: "multi-select",
        required: false,
        options: [
          { value: "Task", label: "Task" },
          { value: "Story", label: "Story" },
          { value: "Bug", label: "Bug" },
        ],
        helpText: "Allowed issue types for new tickets",
      },
    ],
  },
  onEvents: [
    {
      event: "postRunDone",
      handler: async (ctx: IntegrationContext) => {
        // TODO: create or update Jira issue when ticket is done
        console.log("[Jira] postRunDone", ctx.ticketId);
      },
    },
  ],
  ticketCreate: {
    enabled: true,
  },
  ticketImport: {
    enabled: true,
  },
  importSearch,
};

export default jira;
