# Architecture Overview

Lemon is a TypeScript monorepo for AI-driven software design and development (SDD) workflow management.

## Packages

| Package | Description |
|---------|-------------|
| `@lemon/shared` | Common types and Zod schemas |
| `@lemon/server` | Fastify HTTP/WebSocket server + workflow engine |
| `@lemon/cli` | CLI entrypoint for server and commands |
| `@lemon/web` | React + Vite web application |
| `@lemon/electron` | Electron desktop wrapper |
| `@lemon/playwright` | UI testing suite |

## Workflow

```
spec → plan → tasks → implement → done
```

Each step can be auto-approved via configuration. The workflow engine processes tickets through these steps using configurable LLM models.

## Data Storage

- **Global**: `~/.lemon/config.yaml`, `~/.lemon/models.json`, `~/.lemon/workspaces.json`
- **Per-workspace data dir**:
  - `~/.lemon/workspaces/<id>/config.yaml` (settings except actions)
  - `~/.lemon/workspaces/<id>/actions.yaml` (action prompts)
  - `~/.lemon/workspaces/<id>/data.db` (SQLite)
- **Per-workspace repo** (optional overrides):
  - `<repo>/.lemon/workspace.yaml`
  - `<repo>/.lemon/actions.yaml`
