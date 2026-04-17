import type { IntegrationDefinition, IntegrationContext, ExternalTicket } from "../../integration-types.js";

async function importSearch(
  query: string,
  config: Record<string, unknown>
): Promise<ExternalTicket[]> {
  const apiKey = String(config.apiKey || "");
  const teamId = String(config.teamId || "");
  const projectId = String(config.projectId || "");

  if (!apiKey) {
    return [];
  }

  const filter: any = {};
  if (teamId) {
    filter.team = { id: { eq: teamId } };
  }
  if (projectId) {
    filter.project = { id: { eq: projectId } };
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    filter.title = { contains: trimmedQuery };
  }

  const first = trimmedQuery ? 25 : 5;

  const graphqlQuery = `
    query Issues($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first) {
        nodes {
          id
          identifier
          title
          description
          url
          state { name }
        }
      }
    }
  `;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { filter, first },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Linear API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const issues = Array.isArray(data.data?.issues?.nodes) ? data.data.issues.nodes : [];

  return issues.map((issue: any) => ({
    id: issue.id,
    title: issue.title || "",
    description: issue.description || "",
    url: issue.url || `https://linear.app/issue/${issue.identifier}`,
  }));
}

const linear: IntegrationDefinition = {
  id: "linear",
  name: "Linear",
  description: "Sync tickets with Linear",
  form: {
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "secret",
        required: true,
        helpText: "Your Linear personal API key from Settings → API",
      },
      {
        name: "teamId",
        label: "Team ID",
        type: "text",
        required: false,
        placeholder: "TEAM",
        helpText: "The Linear team key (e.g. ENG)",
      },
      {
        name: "projectId",
        label: "Project ID",
        type: "text",
        required: false,
        placeholder: "Optional Linear project ID",
        helpText: "Default project to assign issues to",
      },
      {
        name: "stateId",
        label: "State ID",
        type: "text",
        required: false,
        placeholder: "Optional state ID",
        helpText: "Default workflow state for new issues",
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
        console.log("[Linear] postRunDone", ctx.ticketId);
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

export default linear;
