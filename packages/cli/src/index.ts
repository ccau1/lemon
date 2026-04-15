#!/usr/bin/env node
import { Command } from "commander";
import { ApiClient } from "./api-client.js";
import { serveCommand } from "./commands/serve.js";
import {
  workspaceList,
  workspaceCreate,
  workspaceUse,
  workspaceDelete,
  getDefaultWorkspaceId,
} from "./commands/workspace.js";
import { projectList, projectCreate } from "./commands/project.js";
import {
  ticketList,
  ticketCreate,
  ticketDetails,
  ticketSpec,
  ticketPlan,
  ticketTasks,
  ticketImplement,
  ticketAdvance,
  ticketBack,
  ticketQueue,
  ticketRun,
  ticketRunQueued,
  ticketReset,
} from "./commands/ticket.js";
import { modelList, modelAdd, modelDefault, modelDefaultAll } from "./commands/model.js";
import { configGet, configSet } from "./commands/config.js";

const program = new Command();
program.name("lemon").description("AI SDD Workflow CLI").version("0.1.0");

function getClient() {
  const port = process.env.LEMON_PORT || 3000;
  return new ApiClient(`http://localhost:${port}`);
}

function resolveWorkspaceId(id?: string): string {
  if (id) return id;
  const def = getDefaultWorkspaceId();
  if (!def) {
    console.error("No workspace specified and no default workspace set.");
    process.exit(1);
  }
  return def;
}

// serve
program
  .command("serve")
  .description("Start the Lemon server")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .option("-d, --data-dir <dir>", "Data directory")
  .action(serveCommand);

// workspace
const workspaceCmd = program
  .command("workspace")
  .description("Manage workspaces");

workspaceCmd
  .command("list")
  .description("List workspaces")
  .action(async () => workspaceList(getClient()));

workspaceCmd
  .command("create <name>")
  .description("Create a workspace")
  .requiredOption("-p, --path <path>", "Repository path")
  .action(async (name, opts) => workspaceCreate(getClient(), name, opts.path));

workspaceCmd
  .command("use <id>")
  .description("Set default workspace")
  .action(workspaceUse);

workspaceCmd
  .command("delete <id>")
  .description("Delete a workspace")
  .action(async (id) => workspaceDelete(getClient(), id));

// project
const projectCmd = program.command("project").description("Manage projects");

projectCmd
  .command("list")
  .description("List projects")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (opts) => projectList(getClient(), resolveWorkspaceId(opts.workspace)));

projectCmd
  .command("create <name>")
  .description("Create a project")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (name, opts) =>
    projectCreate(getClient(), resolveWorkspaceId(opts.workspace), name)
  );

// ticket
const ticketCmd = program.command("ticket").description("Manage tickets");

ticketCmd
  .command("list")
  .description("List tickets")
  .option("-w, --workspace <id>", "Workspace ID")
  .option("-p, --project <id>", "Project ID")
  .action(async (opts) =>
    ticketList(getClient(), resolveWorkspaceId(opts.workspace), opts.project)
  );

ticketCmd
  .command("create <title>")
  .description("Create a ticket")
  .option("-p, --project <id>", "Project ID")
  .option("-w, --workspace <id>", "Workspace ID")
  .option("-d, --description <text>", "Ticket description")
  .action(async (title, opts) => {
    const client = getClient();
    const workspaceId = resolveWorkspaceId(opts.workspace);
    let projectId = opts.project;
    if (!projectId) {
      const projects = await client.getProjects(workspaceId);
      if (projects.length === 1) {
        projectId = projects[0].id;
      } else if (projects.length === 0) {
        console.error("No projects found in workspace.");
        process.exit(1);
      } else {
        console.error("Multiple projects found. Use --project <id> to specify.");
        process.exit(1);
      }
    }
    ticketCreate(client, workspaceId, projectId, title, opts.description);
  });

ticketCmd
  .command("details <ticketId>")
  .description("Show ticket details")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketDetails(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("spec <ticketId>")
  .description("Conversational spec mode")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketSpec(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("plan <ticketId>")
  .description("Conversational plan mode")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketPlan(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("tasks <ticketId>")
  .description("Conversational tasks mode")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketTasks(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("implement <ticketId>")
  .description("Conversational implement mode")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketImplement(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("advance <ticketId>")
  .description("Approve current step and advance to next")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketAdvance(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("back <ticketId>")
  .description("Step back to previous workflow step")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketBack(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("queue <ticketId>")
  .description("Queue a ticket for processing")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketQueue(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("reset <ticketId>")
  .description("Reset ticket status back to spec")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketReset(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("run <ticketId>")
  .description("Run a single ticket through its current step")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (ticketId, opts) =>
    ticketRun(getClient(), resolveWorkspaceId(opts.workspace), ticketId)
  );

ticketCmd
  .command("run-queued")
  .description("Run all queued tickets")
  .option("-w, --workspace <id>", "Workspace ID")
  .option("--all-workspaces", "Run across all workspaces")
  .action(async (opts) =>
    ticketRunQueued(getClient(), resolveWorkspaceId(opts.workspace), Boolean(opts.allWorkspaces))
  );

// model
const modelCmd = program.command("model").description("Manage AI models");

modelCmd
  .command("list")
  .description("List models")
  .action(async () => modelList(getClient()));

modelCmd
  .command("add <name>")
  .description("Add a model")
  .requiredOption("--provider <provider>", "Provider (openai, anthropic, openai-compatible, claude-code-cli, kimi-code-cli)")
  .requiredOption("--model-id <modelId>", "Model ID")
  .option("--base-url <url>", "Base URL")
  .option("--api-key <key>", "API Key")
  .action(async (name, opts) =>
    modelAdd(getClient(), { name, provider: opts.provider, modelId: opts.modelId, baseUrl: opts.baseUrl, apiKey: opts.apiKey })
  );

modelCmd
  .command("default")
  .description("Set default model for a workflow step")
  .requiredOption("--step <step>", "Workflow step")
  .requiredOption("--model <modelId>", "Model ID")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (opts) =>
    modelDefault(getClient(), opts.step, opts.model, resolveWorkspaceId(opts.workspace))
  );

modelCmd
  .command("default-all")
  .description("Set default model for all workflow steps")
  .requiredOption("--model <modelId>", "Model ID")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (opts) =>
    modelDefaultAll(getClient(), opts.model, resolveWorkspaceId(opts.workspace))
  );

// config
const configCmd = program.command("config").description("Manage settings");

configCmd
  .command("get [key]")
  .description("Get config")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (key, opts) => {
    const cfg = await configGet(getClient(), resolveWorkspaceId(opts.workspace));
    if (key) {
      const parts = key.split(".");
      let cur = cfg;
      for (const p of parts) cur = cur?.[p];
      console.log(cur);
    }
  });

configCmd
  .command("set <key> <value>")
  .description("Set config value")
  .option("-w, --workspace <id>", "Workspace ID")
  .action(async (key, value, opts) =>
    configSet(getClient(), key, value, resolveWorkspaceId(opts.workspace))
  );

program.parse();
