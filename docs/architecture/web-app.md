# Web App Architecture

## Stack

- React 19
- Vite 6
- Tailwind CSS 3
- TanStack Query 5
- React Router 7

## Pages

- **WorkspacesPage** — list and create workspaces
- **WorkspacePage** — projects and recent tickets for a workspace
- **ProjectPage** — Kanban-style board of tickets
- **TicketPage** — ticket details, artifacts, and AI chat panel
- **ModelsPage** — model registry management
- **SettingsPage** — auto-approve toggles and concurrency

## API Client

`src/api.ts` provides a thin wrapper around `fetch` for all server endpoints.

## WebSocket Hook

`src/hooks/useWebSocket.ts` connects to `/ws` and surfaces the last received message.
