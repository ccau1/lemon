import type { IntegrationDefinition, IntegrationContext, ExternalTicket } from "../../integration-types.js";

function extractJiraDescription(desc: unknown): string {
  if (typeof desc === "string") return desc;
  if (!desc || typeof desc !== "object") return "";
  const extract = (obj: any): string => {
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) return obj.map(extract).join("");
    if (obj?.text) return String(obj.text);
    if (obj?.content) return extract(obj.content);
    return "";
  };
  return extract(desc).trim();
}

async function importSearch(
  query: string,
  config: Record<string, unknown>
): Promise<ExternalTicket[]> {
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  const email = String(config.email || "");
  const apiToken = String(config.apiToken || "");
  const projectKey = String(config.projectKey || "");

  if (!baseUrl || !email || !apiToken || !projectKey) {
    return [];
  }

  const jqlParts: string[] = [`project = ${projectKey}`];
  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    const escaped = trimmedQuery.replace(/"/g, '\\"');
    jqlParts.push(`text ~ "${escaped}"`);
  }
  jqlParts.push("ORDER BY created DESC");

  const url = new URL(`${baseUrl}/rest/api/3/search`);
  url.searchParams.set("jql", jqlParts.join(" AND "));
  url.searchParams.set("maxResults", trimmedQuery ? "25" : "5");
  url.searchParams.set("fields", "summary,description");

  const auth = btoa(`${email}:${apiToken}`);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Jira API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const issues = Array.isArray(data.issues) ? data.issues : [];

  return issues.map((issue: any) => ({
    id: issue.key || issue.id,
    title: issue.fields?.summary || "",
    description: extractJiraDescription(issue.fields?.description),
    url: `${baseUrl}/browse/${issue.key}`,
  }));
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
      {
        name: "titleRegex",
        label: "Title Regex Filter",
        type: "text",
        required: false,
        placeholder: "^.*\\s+\\[lemon\\]$",
        helpText: "Only import/sync tickets whose titles match this regex",
      },
    ],
  },
  onEvents: [
    {
      event: "postRunDone",
      handler: async (ctx: IntegrationContext) => {
        console.log("[Jira] postRunDone", ctx.ticketId);
      },
    },
  ],
  // CAUTION: enabling ticketCreate risks infinite loops when combined with
  // ticketImport or polling. Always check `externalSource`/`externalSourceId`
  // before creating an outbound issue to avoid re-exporting imported tickets.
  ticketCreate: {
    enabled: false,
  },
  ticketImport: {
    enabled: true,
  },
  importSearch,
};

export default jira;
