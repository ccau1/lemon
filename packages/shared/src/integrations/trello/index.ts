import type { IntegrationDefinition, IntegrationContext, ExternalTicket } from "../../integration-types.js";

async function importSearch(
  query: string,
  config: Record<string, unknown>
): Promise<ExternalTicket[]> {
  const key = String(config.apiKey || "");
  const token = String(config.apiToken || "");
  const boardId = String(config.boardId || "");
  const listId = String(config.listId || "");

  if (!key || !token || !boardId) {
    return [];
  }

  const base = "https://api.trello.com/1";
  let targetUrl: URL;

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    targetUrl = new URL(`${base}/search`);
    targetUrl.searchParams.set("query", trimmedQuery);
    targetUrl.searchParams.set("modelTypes", "cards");
    targetUrl.searchParams.set("boards", boardId);
    targetUrl.searchParams.set("card_fields", "id,name,desc,shortUrl,idList");
  } else {
    targetUrl = new URL(`${base}/boards/${boardId}/cards`);
    targetUrl.searchParams.set("fields", "id,name,desc,shortUrl,idList");
  }

  targetUrl.searchParams.set("key", key);
  targetUrl.searchParams.set("token", token);
  targetUrl.searchParams.set("limit", trimmedQuery ? "25" : "5");

  const res = await fetch(targetUrl.toString());

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Trello API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  let cards = Array.isArray(trimmedQuery ? data.cards : data) ? (trimmedQuery ? data.cards : data) : [];

  if (listId) {
    cards = cards.filter((c: any) => c.idList === listId);
  }

  return cards.slice(0, trimmedQuery ? 25 : 5).map((c: any) => ({
    id: c.id,
    title: c.name || "",
    description: c.desc || "",
    url: c.shortUrl || `https://trello.com/c/${c.id}`,
  }));
}

const trello: IntegrationDefinition = {
  id: "trello",
  name: "Trello",
  description: "Sync tickets with Trello boards",
  form: {
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "secret",
        required: true,
        helpText: "Your Trello API key from https://trello.com/app-key",
      },
      {
        name: "apiToken",
        label: "API Token",
        type: "secret",
        required: true,
        helpText: "Your Trello API token (generate from the same page)",
      },
      {
        name: "boardId",
        label: "Board ID",
        type: "text",
        required: true,
        placeholder: "5f3c...",
        helpText: "The Trello board ID to sync with",
      },
      {
        name: "listId",
        label: "List ID",
        type: "text",
        required: false,
        placeholder: "5f3c...",
        helpText: "Default list ID where new cards will be created",
      },
      {
        name: "labelIds",
        label: "Label IDs",
        type: "text",
        required: false,
        placeholder: "label1,label2",
        helpText: "Comma-separated label IDs to apply to new cards",
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
        console.log("[Trello] postRunDone", ctx.ticketId);
      },
    },
  ],
  // CAUTION: enabling ticketCreate risks infinite loops when combined with
  // ticketImport or polling. Always check `externalSource`/`externalSourceId`
  // before creating an outbound card to avoid re-exporting imported tickets.
  ticketCreate: {
    enabled: false,
  },
  ticketImport: {
    enabled: true,
  },
  importSearch,
};

export default trello;
