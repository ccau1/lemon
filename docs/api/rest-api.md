# REST API

Base URL: `http://localhost:3000`

## Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workspaces` | List workspaces |
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces/:id` | Get workspace |
| DELETE | `/workspaces/:id` | Delete workspace |

## Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects?workspaceId=` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id?workspaceId=` | Get project |

## Tickets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets?workspaceId=&projectId=` | List tickets |
| POST | `/tickets?workspaceId=` | Create ticket |
| GET | `/tickets/:id?workspaceId=` | Get ticket |
| GET | `/tickets/:id/details?workspaceId=` | Get ticket + artifacts |
| POST | `/tickets/:id/spec?workspaceId=` | Save spec |
| POST | `/tickets/:id/plan?workspaceId=` | Save plan |
| POST | `/tickets/:id/tasks?workspaceId=` | Save tasks |
| POST | `/tickets/:id/implement?workspaceId=` | Save implementation |
| POST | `/tickets/:id/advance?workspaceId=` | Advance to next step |
| POST | `/tickets/:id/queue?workspaceId=` | Queue ticket |
| POST | `/tickets/:id/run?workspaceId=` | Run ticket |
| POST | `/tickets/run` | Run all queued tickets |

## Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tickets/:id/chat?workspaceId=` | Chat with AI about step |

## Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models` | List models |
| POST | `/models` | Add model |
| GET | `/models/:id` | Get model |
| PATCH | `/models/:id` | Update model |
| DELETE | `/models/:id` | Delete model |

## Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config?workspaceId=` | Get effective config |
| POST | `/config` | Set config value |
| POST | `/config/default-model` | Set default model for step |
