# Server Architecture

## Stack

- **Framework**: Fastify + `@fastify/websocket`
- **Database**: better-sqlite3 + Drizzle ORM
- **Queue**: p-queue (per-workspace concurrency)

## Key Modules

### `src/db/index.ts`
Factory for per-workspace SQLite connections. Auto-migrates schema on first access.

### `src/config/settings.ts`
YAML-based configuration manager supporting hierarchical settings (later wins):
1. Hardcoded defaults
2. Global `~/.lemon/config.yaml`
3. `~/.lemon/workspaces/<id>/config.yaml`
4. `~/.lemon/workspaces/<id>/actions.yaml`
5. `<repo>/.lemon/workspace.yaml`
6. `<repo>/.lemon/actions.yaml`

Actions are split into a separate `actions.yaml` file. The repo-level files allow users to version-control workspace-specific overrides.

### `src/config/model-registry.ts`
Global JSON-backed registry of LLM configurations.

### `src/services/llm.ts`
Multi-model LLM client factory. Resolves the correct model per `(workspace, project, step)`.

### `src/services/workflow.ts`
Background workflow engine that:
- Derives current step from existing data
- Checks auto-approve flags
- Generates artifacts via LLM
- Advances tickets and broadcasts WebSocket events

## WebSocket Events

- `ticket:queued`
- `ticket:running`
- `ticket:awaiting_review`
- `ticket:advanced`
- `ticket:error`
- `ticket:batch_started`
