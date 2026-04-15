# SQLite vs Pure File Storage — Evaluation

**Date:** 2026-04-15  
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
- `.lemon/tickets/<id>/{spec,plan,tasks,implement}.md` — artifact file-sync mirrors

## What SQLite Stores

| Table | Purpose |
|-------|---------|
| `projects` | Project metadata per workspace |
| `tickets` | Ticket headers (title, status, project linkage) |
| `specs` | Generated spec markdown per ticket |
| `plans` | Generated plan markdown per ticket |
| `tasks` | Task list (description + done flag) per ticket |
| `implementations` | Generated implementation markdown per ticket |
| `action_runs` | Log of custom action executions (response, model used) |
| `step_model_overrides` | Per-project / per-step model overrides |

Schema lives in `packages/server/src/db/schema.ts` and is bootstrapped inline in `packages/server/src/db/index.ts`.

Access patterns are simple CRUD, cross-table reads per ticket, and workflow-engine writes that delete + insert into artifact tables.

## Decision: Keep SQLite

A pure file-based approach is technically possible but not advisable for this project.

### Why SQLite Fits

1. **Concurrency & ACID**  
   The server exposes HTTP and WebSocket endpoints. The workflow queue (`p-queue`) and multiple clients can update the same workspace simultaneously. SQLite provides atomic writes; plain files would require custom locking to avoid corruption.

2. **Querying**  
   The app frequently filters by `projectId`, `workspaceId`, and `ticketId`, and sorts `action_runs` by `created_at`. Re-implementing this in userland would add significant boilerplate.

3. **Composite keys**  
   `step_model_overrides` uses `(project_id, step)` as a composite primary key. This maps naturally to SQL but awkwardly to flat files.

4. **Cross-workspace listing**  
   Endpoints like `GET /tickets/all` iterate every workspace and query its DB. Replacing this with recursive file scanning across many workspaces would be slower and more fragile.

5. **Zero operational cost**  
   The database is already embedded and per-workspace. There is no external server to manage. Switching to files removes a small dependency footprint but adds large application complexity.

## If We Ever Switch to Files

These changes would be required:

1. **Replace DB layer** — Remove `drizzle-orm` + `better-sqlite3` from `packages/server/src/db/` and introduce a file-backed repository layer.
2. **Rewrite repositories** — Convert all `db.select/insert/update/delete` calls in route handlers and `WorkflowEngine` to JSON/YAML file I/O.
3. **Add locking** — Introduce file-level locking (e.g., `proper-lockfile` or advisory `fs` locks) because multiple requests can mutate the same workspace concurrently.
4. **Re-implement queries** — Build filtering, sorting, and foreign-key-like lookups in application code.
5. **Update cross-workspace endpoints** — Rewrite `/tickets/all` and similar to recursively scan and parse files across all workspace directories.
6. **Dependency cleanup** — Remove `better-sqlite3`, `drizzle-orm`, and `drizzle-kit` from `packages/server/package.json` and delete migration assets.

## Bottom Line

SQLite is doing exactly what it should here. A move to pure file storage would be a regression in reliability and would effectively require writing a database in userland.
