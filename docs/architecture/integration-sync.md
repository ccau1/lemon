# Integration Ticket Sync Architecture

This document describes how Lemon can synchronize tickets from external task management systems (Jira, Shortcut) into Lemon.

## Goal

When a ticket is created in Jira or Shortcut, Lemon should optionally create a corresponding local ticket. The user controls this via integrations configured in **Settings → Integrations**.

## Inbound Event Strategies

There are two primary ways to receive ticket-creation events from external systems:

1. **Webhooks** (push, real-time)
2. **Polling** (pull, scheduled)

### 1. Webhooks

External systems POST event payloads to a public URL that Lemon exposes.

- **Jira**: Supports registering webhooks via Admin UI or REST API (`/rest/api/3/webhook`).
- **Shortcut**: Supports registering webhooks via API (`/api/v3/webhooks`).

#### Advantages
- Near real-time sync.
- Low API usage on the external system.

#### Disadvantages
- Requires a publicly reachable URL.
- Complex for users running Lemon on a local machine.

---

### 2. Polling

Lemon periodically queries the external system for recently created tickets.

- **Jira**: `GET /rest/api/3/search?jql=created >= -5m ORDER BY created DESC`
- **Shortcut**: `GET /api/v3/search/stories` with a date filter

#### Advantages
- Works behind firewalls and on local machines without tunnels.
- No infrastructure required.

#### Disadvantages
- Delayed sync (interval-dependent).
- Higher API usage on the external system.

---

## Recommended Hybrid Strategy

**Use webhooks as the primary channel and polling as a fallback.**

This gives users real-time sync when possible, while ensuring reliability when public URLs are unavailable.

## The Local Machine Problem

A laptop running Lemon does not have a public IP or DNS name. External webhooks cannot reach it directly.

### Solutions

| Approach | How it works | Best for |
|----------|--------------|----------|
| **Manual tunnel** | User runs `ngrok http 3000` and pastes the public URL into the integration settings. | Power users, quick testing |
| **Automatic tunnel** | Lemon server/CLI spawns an embedded tunnel (e.g. `ngrok` or `localtunnel`) on startup and auto-registers the webhook URL via the external system's API. | Zero-friction local development |
| **Cloud relay** | A lightweight cloud service queues events; the local Lemon client polls the relay. | Production-grade deployments |

### Recommendation

Implement an **automatic tunnel helper** for local development. If `NODE_ENV !== 'production'` and no `WEBHOOK_BASE_URL` environment variable is set, the server can attempt to start a tunnel and print the public URL. In a future iteration, the integration registry can auto-update the webhook URL in Jira/Shortcut when the tunnel changes.

## Filtering

Not every external ticket should become a Lemon ticket. Each integration can define a title regex filter. The default regex targets tickets ending with a tag:

```
^.*\s+\[lemon\]$
```

Examples:
- `Fix login bug [lemon]` → **synced**
- `Update Q3 roadmap` → **ignored**

The filter is applied on the inbound path (webhook handler or poller) before a Lemon ticket is created.

## Ticket Creation Flow

When a qualifying external ticket is found:

1. **Normalize** the payload into a common shape (`ExternalTicket`).
2. **Resolve** the target workspace and project.
   - Use `targetWorkspaceId` and `targetProjectId` stored in the integration config.
   - If missing, fall back to a default project in the first workspace.
3. **Insert** a Lemon ticket with:
   - `title` = external title (tag optionally stripped)
   - `description` = external description + link back to the external issue
   - `status` = `spec`
4. **Map** the external ID to the Lemon ticket in an `externalTickets` table or JSON column so future updates can sync bidirectionally.

## Data Model (Proposed)

```ts
interface ExternalTicket {
  externalId: string;      // Jira issue key or Shortcut story ID
  integrationId: string;   // Lemon integration config ID
  ticketId: string;        // Local Lemon ticket ID
  title: string;
  description: string;
  url: string;
  labels: string[];
  syncedAt: string;
}
```

## Implementation Path

1. **Add fields** to integration forms:
   - `targetWorkspaceId`
   - `targetProjectId`
   - `titleRegex`
2. **Build webhook endpoints**:
   - `POST /api/integrations/webhook/jira`
   - `POST /api/integrations/webhook/shortcut`
3. **Build a `WebhookTunnel` service** that optionally starts a tunnel in dev mode.
4. **Build a `Poller` service** that runs on an interval and polls enabled integrations.
5. **Create an `externalTickets` table** in the workspace SQLite DB for bidirectional sync.

## Open Questions

- Should tag stripping (`[lemon]`) be configurable or automatic?
- Should the poller interval be global or per-integration?
- Do we want to sync updates/deletes, or only creation?
