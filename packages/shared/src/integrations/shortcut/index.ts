import type { IntegrationDefinition, IntegrationContext, ExternalTicket } from "../../integration-types.js";

async function importSearch(
  query: string,
  config: Record<string, unknown>
): Promise<ExternalTicket[]> {
  // TODO: implement real Shortcut search via /api/v3/search/stories
  const mock: ExternalTicket[] = [
    {
      id: "sc-1",
      title: `${query || "Shortcut"} story A`,
      description: "Description for Shortcut story A",
      url: "https://app.shortcut.com/story/sc-1",
    },
    {
      id: "sc-2",
      title: `${query || "Shortcut"} story B`,
      description: "Description for Shortcut story B",
      url: "https://app.shortcut.com/story/sc-2",
    },
  ];
  return mock.filter((r) => !query || r.title.toLowerCase().includes(query.toLowerCase()));
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
    ],
  },
  onEvents: [
    {
      event: "postRunDone",
      handler: async (ctx: IntegrationContext) => {
        // TODO: create or update Shortcut story when ticket is done
        console.log("[Shortcut] postRunDone", ctx.ticketId);
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

export default shortcut;
