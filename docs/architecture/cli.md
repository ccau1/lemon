# CLI Architecture

## Overview

The `@lemon/cli` package is a thin Node.js client over the `@lemon/server` REST API. It is built with [Commander](https://github.com/tj/commander.js) and consumes `src/api-client.ts` for all server communication.

## Entry Point

`src/index.ts` bootstraps the CLI, wires subcommands, and resolves a default workspace from `~/.lemon/.default_workspace`.

```ts
const client = new ApiClient(`http://localhost:${process.env.LEMON_PORT || 3000}`);
```

## ApiClient

`src/api-client.ts` wraps `fetch` for every server endpoint. It is stateless and handles JSON serialization and basic error decoding.

## Commands

### `serve`
Starts the Lemon server inline.

```bash
lemon serve -p 3000 -d ~/.lemon
```

Environment variables: `PORT`, `DATA_DIR`.

### `workspace`
Manage workspace registry.

| Command | Description |
|---------|-------------|
| `workspace list` | List all workspaces |
| `workspace create <name> --path <repoPath>` | Register a new workspace |
| `workspace use <id>` | Write default workspace to `~/.lemon/.default_workspace` |
| `workspace delete <id>` | Remove workspace from registry |

### `project`
Manage projects inside a workspace.

| Command | Description |
|---------|-------------|
| `project list [-w <id>]` | List projects |
| `project create <name> [-w <id>]` | Create a project |

If `-w` is omitted, the default workspace is used.

### `ticket`
The richest command surface. Manages tickets and drives the workflow.

| Command | Description |
|---------|-------------|
| `ticket list [-w <id>] [-p <projectId>]` | List tickets |
| `ticket create <title> [-w <id>] [-p <projectId>]` | Create a ticket. If no project is given and the workspace has exactly one project, it is used automatically. |
| `ticket details <ticketId> [-w <id>]` | Print ticket JSON |
| `ticket spec <ticketId> [-w <id>]` | Enter conversational spec mode |
| `ticket plan <ticketId> [-w <id>]` | Enter conversational plan mode |
| `ticket tasks <ticketId> [-w <id>]` | Enter conversational tasks mode |
| `ticket implement <ticketId> [-w <id>]` | Enter conversational implement mode |
| `ticket advance <ticketId> [-w <id>]` | Approve current step and advance |
| `ticket back <ticketId> [-w <id>]` | Step back to previous status |
| `ticket queue <ticketId> [-w <id>]` | Mark ticket as queued |
| `ticket run <ticketId> [-w <id>]` | Run ticket through current step |
| `ticket run-queued [-w <id>] [--all-workspaces]` | Run all queued tickets |
| `ticket reset <ticketId> [-w <id>]` | Reset ticket back to `spec` |

#### Conversational Modes

`spec`, `plan`, `tasks`, and `implement` open a readline REPL that streams messages to `/tickets/:id/chat`. Inside the loop:

- Type normally to refine the output with the LLM.
- `save` — persist the last response to the server.
- `done` — persist and advance the ticket.
- `exit` — quit without saving.

### `model`
Manage LLM configurations.

| Command | Description |
|---------|-------------|
| `model list` | List registered models |
| `model add <name> --provider <p> --model-id <id> [--base-url <url>] [--api-key <key>]` | Add a model |
| `model default --step <step> --model <modelId> [-w <id>]` | Set per-step default model |
| `model default-all --model <modelId> [-w <id>]` | Set default model for all steps |

### `config`
Read and write settings.

| Command | Description |
|---------|-------------|
| `config get [key] [-w <id>]` | Get resolved config (global or workspace) |
| `config set <key> <value> [-w <id>]` | Set a config value (dot-notation keys supported) |

## Default Workspace Resolution

Most commands accept an optional `-w, --workspace <id>` flag. If omitted, the CLI reads `~/.lemon/.default_workspace`. If that file is missing, the command exits with an error.

## Data Storage

- `~/.lemon/.default_workspace` — plain text file containing the default workspace UUID
