# SQLite vs Pure File Storage — Evaluation

**Date:** 2026-04-17 (updated after file-first refactor)  
**Scope:** `packages/server` data persistence layer

## Current State

Only `packages/server` uses SQLite. Each workspace owns a single SQLite file:

```
<dataDir>/workspaces/<workspaceId>/data.db
```

Dependencies:
- `better-sqlite3` (driver)
- `drizzle-orm` (query builder)
- `drizzle-kit` (migrations, dev-only)

Everything outside of this DB is already plain files:
- `workspaces.json` — workspace registry
- `models.json` — model registry
- `config.yaml` / `actions.yaml` — settings
- `<dataDir>/workspaces/<workspaceId>/projects.json` — project registry per workspace
- `<dataDir>/workspaces/<workspaceId>/config.yaml` — workspace settings including `stepModelOverrides`
- `.lemon/tickets/<id>/{spec,plan,tasks,implement}.md` — artifact markdown files
- `.lemon/tickets/<id>/tasks.json` — structured task list
- `.lemon/tickets/<id>/thread.jsonl` — LLM conversation threads per ticket
- `.lemon/tickets/<id>/.lmstate` — transient ticket state (`errorStep`, `errorMessage`)
- `.lemon/tickets/<id>/.conf` — per-ticket configuration (`autoApprove` overrides)
- `.lemon/tickets/.archived_<id>/` — archived ticket folders (filesystem-based archival)

## What SQLite Stores (after minimisation)

| Table | Purpose |
|-------|---------|
| `tickets` | Ticket headers only (`title`, `description`, `status`, `projectId`, timestamps) |
| `action_runs` | Log of custom action executions (`status`, `response`, `createdAt`) |

**What we removed from SQLite:**
- `specs`, `plans`, `tasks`, `implementations` — ticket artifacts now live as files inside each ticket folder.
- `ticket_threads` — thread history now lives as `thread.jsonl` per ticket.
- `archived_at` column on `tickets` — archival is now represented by renaming the ticket folder to `.archived_<ticketId>`.
- `auto_approve`, `error_step`, `error_message` columns on `tickets` — per-ticket config (`autoApprove`) lives in `.conf`, and transient error state lives in `.lmstate`.
- `projects` — moved to `<dataDir>/workspaces/<workspaceId>/projects.json`.
- `step_model_overrides` — moved into workspace `config.yaml` under the `stepModelOverrides` key.

Schema lives in `packages/server/src/db/schema.ts` and is bootstrapped inline in `packages/server/src/db/index.ts`. A one-shot migration (`migrate-to-files.ts`) runs on startup to export legacy DB rows into files and drop the old tables.

Access patterns are simple CRUD and workflow-engine writes that update ticket status only; all artifact I/O is file-based.

## Decision: Keep SQLite for the remainder

A pure file-based approach is technically possible for the remaining four tables but not advisable for this project.

### Why SQLite Still Fits

1. **Concurrency & ACID**  
   The server exposes HTTP and WebSocket endpoints. The workflow queue (`p-queue`) and multiple clients can update the same workspace simultaneously. SQLite provides atomic writes for `tickets` and `action_runs`; plain files would require custom locking to avoid corruption.

2. **Querying**  
   The app frequently filters by `projectId`, `workspaceId`, and `ticketId`, and sorts `action_runs` by `created_at`. Re-implementing this in userland would add significant boilerplate.

3. **Cross-workspace listing**  
   Endpoints like `GET /tickets/all` and `GET /actions/runs` iterate every workspace and query its DB. Replacing this with recursive file scanning across many workspaces would be slower and more fragile.

4. **Zero operational cost**  
   The database is already embedded and per-workspace. There is no external server to manage. Switching the remaining tables to files removes a small dependency footprint but adds large application complexity.

## If We Ever Remove the Rest

These changes would be required:

1. **Replace DB layer** — Remove `drizzle-orm` + `better-sqlite3` from `packages/server/src/db/` and introduce a file-backed repository layer.
2. **Rewrite repositories** — Convert all `db.select/insert/update/delete` calls in route handlers, `WorkflowEngine`, `ActionRunQueue`, and `LlmService` to JSON/YAML file I/O.
3. **Add locking** — Introduce file-level locking (e.g., `proper-lockfile` or advisory `fs` locks) because multiple requests can mutate the same workspace concurrently.
4. **Re-implement queries** — Build filtering, sorting, and foreign-key-like lookups in application code.
5. **Update cross-workspace endpoints** — Rewrite `/tickets/all` and `/actions/runs` to recursively scan and parse files across all workspace directories.
6. **Dependency cleanup** — Remove `better-sqlite3`, `drizzle-orm`, and `drizzle-kit` from `packages/server/package.json` and delete migration assets.

## Bottom Line

SQLite is now used only for small, high-churn metadata (`tickets`, `projects`, `action_runs`, `step_model_overrides`) while all large, human-readable content (specs, plans, tasks, implementations, threads) lives in plain files alongside the workspace. This minimises DB duplication without sacrificing reliability for the parts that genuinely benefit from an embedded database.
