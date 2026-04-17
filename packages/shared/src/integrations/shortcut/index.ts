import type { IntegrationDefinition, IntegrationContext, ExternalTicket } from "../../integration-types.js";

async function importSearch(
  query: string,
  config: Record<string, unknown>
): Promise<ExternalTicket[]> {
  const apiToken = String(config.apiToken || "");
  const projectId = config.projectId ? String(config.projectId) : "";
  if (!apiToken) {
    return [];
  }

  const trimmedQuery = query.trim();
  let url: URL;

  if (projectId && !trimmedQuery) {
    url = new URL(`https://api.app.shortcut.com/api/v3/projects/${projectId}/stories`);
  } else {
    url = new URL("https://api.app.shortcut.com/api/v3/search");
    if (trimmedQuery) {
      url.searchParams.set("query", trimmedQuery);
    }
  }
  url.searchParams.set("page_size", trimmedQuery ? "25" : "5");

  const res = await fetch(url.toString(), {
    headers: {
      "Shortcut-Token": apiToken,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Shortcut API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const stories = projectId && !trimmedQuery ? (Array.isArray(data) ? data : []) : (Array.isArray(data.stories) ? data.stories : []);

  return stories.map((s: any) => ({
    id: String(s.id),
    title: s.name || "",
    description: s.description || "",
    url: s.app_url || `https://app.shortcut.com/story/${s.id}`,
  }));
}

const shortcut: IntegrationDefinition = {
  id: "shortcut",
  name: "Shortcut",
  description: "Sync tickets with Shortcut (formerly Clubhouse)",
  form: {
    fields: [
      {
        name: "apiToken",
        label: "API Token",
        type: "secret",
        required: true,
        helpText: "Your Shortcut API token",
      },
      {
        name: "workflowId",
        label: "Workflow ID",
        type: "number",
        required: false,
        helpText: "The Shortcut workflow ID to use",
      },
      {
        name: "projectId",
        label: "Project ID",
        type: "number",
        required: false,
        helpText: "Only import/sync stories from this Shortcut project",
      },
      {
        name: "teamId",
        label: "Team ID",
        type: "text",
        required: false,
        helpText: "The Shortcut team ID to assign stories to",
      },
      {
        name: "storyType",
        label: "Story Type",
        type: "select",
        required: false,
        options: [
          { value: "feature", label: "Feature" },
          { value: "bug", label: "Bug" },
          { value: "chore", label: "Chore" },
        ],
        helpText: "Default story type for new tickets",
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
        console.log("[Shortcut] postRunDone", ctx.ticketId);
      },
    },
  ],
  // CAUTION: enabling ticketCreate risks infinite loops when combined with
  // ticketImport or polling. Always check `externalSource`/`externalSourceId`
  // before creating an outbound story to avoid re-exporting imported tickets.
  ticketCreate: {
    enabled: false,
  },
  ticketImport: {
    enabled: true,
  },
  importSearch,
};

export default shortcut;
