import type { ApiClient } from "../api-client.js";
import readline from "readline";

export async function ticketList(
  client: ApiClient,
  workspaceId: string,
  projectId?: string
) {
  const tickets = await client.getTickets(workspaceId, projectId);
  console.log("Tickets:");
  for (const t of tickets) {
    console.log(`  ${t.id} | [${t.status}] ${t.title}`);
  }
}

export async function ticketCreate(
  client: ApiClient,
  workspaceId: string,
  projectId: string,
  title: string,
  description?: string
) {
  const t = await client.createTicket(workspaceId, { projectId, title, description });
  console.log("Created ticket:", t);
}

export async function ticketDetails(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  const details = await client.getTicketDetails(workspaceId, ticketId);
  console.log(JSON.stringify(details, null, 2));
}

export async function ticketQueue(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await client.queueTicket(workspaceId, ticketId);
  console.log("Ticket queued:", ticketId);
}

export async function ticketReset(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await client.resetTicket(workspaceId, ticketId);
  console.log("Ticket reset to spec:", ticketId);
}

export async function ticketRun(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await client.runTicket(workspaceId, ticketId);
  console.log("Ticket run started:", ticketId);
}

export async function ticketRunQueued(
  client: ApiClient,
  workspaceId: string,
  allWorkspaces = false
) {
  await client.runQueued(workspaceId, allWorkspaces);
  console.log("Queued tickets run initiated.");
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function runChatLoop<T = string>(
  client: ApiClient,
  workspaceId: string,
  ticketId: string,
  step: "spec" | "plan" | "tasks" | "implement",
  systemPrompt: string,
  initialUserPrompt: string,
  saveFn: (workspaceId: string, ticketId: string, content: T) => Promise<any>,
  parseFn?: (raw: string) => T
) {
  const details = await client.getTicketDetails(workspaceId, ticketId);
  const title = details.ticket.title;

  console.log(`Entering ${step} conversation mode for ticket "${title}"`);
  console.log("Type your message to refine. Commands: [save] to store, [done] to save & advance, [exit] to quit without saving.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => new Promise<string>((resolve) => rl.question("> ", resolve));

  const ticketLine = details.ticket.description?.trim()
    ? `Ticket: ${title}\nDescription: ${details.ticket.description}`
    : `Ticket: ${title}`;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialUserPrompt.replace("{{title}}", ticketLine) },
  ];

  let lastResponse = "";

  while (true) {
    const input = await ask();
    const trimmed = input.trim();

    if (trimmed === "exit") {
      rl.close();
      console.log("Exited without saving.");
      return;
    }

    const payload = parseFn ? parseFn(lastResponse) : (lastResponse as unknown as T);

    if (trimmed === "save") {
      await saveFn(workspaceId, ticketId, payload);
      rl.close();
      console.log(`${step} saved.`);
      return;
    }

    if (trimmed === "done") {
      await saveFn(workspaceId, ticketId, payload);
      const result = await client.advanceTicket(workspaceId, ticketId);
      rl.close();
      console.log(`${step} saved. Ticket advanced to:`, result.newStatus);
      return;
    }

    messages.push({ role: "user", content: input });

    try {
      const res = await client.chatTicket(workspaceId, ticketId, { step, messages });
      lastResponse = res.content;
      console.log(`\n[${res.model}]\n${res.content}\n`);
      messages.push({ role: "assistant", content: res.content });
    } catch (e: any) {
      console.error("Error:", e.message);
    }
  }
}

export async function ticketSpec(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await runChatLoop(
    client,
    workspaceId,
    ticketId,
    "spec",
    "You are an expert product manager. Help the user write a clear, concise spec for a software ticket. Ask clarifying questions if needed. When the user is satisfied, output the final spec in markdown.",
    "Ticket title: {{title}}\n\nPlease help me write a spec for this ticket.",
    client.saveSpec.bind(client)
  );
}

export async function ticketPlan(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await runChatLoop(
    client,
    workspaceId,
    ticketId,
    "plan",
    "You are a senior software architect. Given a spec, help the user write a high-level implementation plan in markdown. Ask clarifying questions if needed.",
    "Ticket title: {{title}}\n\nPlease help me write an implementation plan for this ticket.",
    client.savePlan.bind(client)
  );
}

function parseTasks(raw: string): Array<{ description: string; done: boolean }> {
  try {
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      return json.map((t: any) => ({
        description: String(t.description ?? ""),
        done: Boolean(t.done ?? false),
      }));
    }
  } catch {
    // fallback: treat each line as a task
    return raw
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter((l) => l.length > 0)
      .map((l) => ({ description: l, done: false }));
  }
  return [];
}

export async function ticketTasks(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await runChatLoop(
    client,
    workspaceId,
    ticketId,
    "tasks",
    'You are a project manager. Given a plan, break it into a list of implementation tasks. Return ONLY a JSON array like [{"description":"...","done":false}, ...]. Ask clarifying questions if needed.',
    "Ticket title: {{title}}\n\nPlease help me break this into tasks.",
    client.saveTasks.bind(client),
    parseTasks
  );
}

export async function ticketImplement(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  await runChatLoop(
    client,
    workspaceId,
    ticketId,
    "implement",
    "You are a senior engineer. Given tasks, describe the implementation approach, key code changes, and file names in markdown. Ask clarifying questions if needed.",
    "Ticket title: {{title}}\n\nPlease help me write the implementation details for this ticket.",
    client.saveImplementation.bind(client)
  );
}

export async function ticketAdvance(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  const result = await client.advanceTicket(workspaceId, ticketId);
  console.log("Ticket advanced to:", result.newStatus);
}

export async function ticketBack(
  client: ApiClient,
  workspaceId: string,
  ticketId: string
) {
  const result = await client.stepBackTicket(workspaceId, ticketId);
  console.log("Ticket stepped back to:", result.newStatus);
}
