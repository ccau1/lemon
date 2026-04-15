# WebSocket API

Connect to `ws://localhost:3000/ws`

## Events (Server → Client)

The server broadcasts JSON messages in the following format:

```json
{
  "event": "ticket:advanced",
  "payload": {
    "workspaceId": "...",
    "ticketId": "...",
    "newStep": "plan"
  }
}
```

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `ticket:queued` | `{ workspaceId, ticketId }` | Ticket was queued |
| `ticket:running` | `{ workspaceId, ticketId }` | Ticket step processing started |
| `ticket:awaiting_review` | `{ workspaceId, ticketId, step }` | Ticket paused for review |
| `ticket:advanced` | `{ workspaceId, ticketId, newStep }` | Ticket moved to next step |
| `ticket:error` | `{ workspaceId, ticketId, error }` | Processing failed |
| `ticket:batch_started` | `{ workspaceId, count }` | Parallel batch started |
