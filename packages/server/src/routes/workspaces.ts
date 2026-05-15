import type { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { DB } from "../db/index.js";
import { tickets, actionRuns } from "../db/schema.js";
import { hasTicketArtifacts } from "../services/file-sync.js";

const createSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

function projectsPath(dataDir: string, workspaceId: string): string {
  return path.join(dataDir, "workspaces", workspaceId, "projects.json");
}

export async function workspaceRoutes(
  fastify: FastifyInstance,
  { registry, dataDir, getDb }: { registry: WorkspaceRegistry; dataDir: string; getDb: (workspaceId: string) => DB }
) {
  fastify.get("/workspaces", async () => {
    return registry.list();
  });

  fastify.get("/workspaces/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ws = registry.get(id);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    return ws;
  });

  fastify.patch("/workspaces/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1).optional(),
      path: z.string().min(1).optional(),
    }).parse(request.body);
    const ws = registry.get(id);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const updated = registry.update(id, body);
    if (!updated) return reply.status(404).send({ error: "Workspace not found" });
    return updated;
  });

  fastify.post("/workspaces", async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const ws = registry.create(body.name, body.path);
      const now = new Date().toISOString();
      const p = projectsPath(dataDir, ws.id);
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        p,
        JSON.stringify(
          [{ id: crypto.randomUUID(), workspaceId: ws.id, name: "default", createdAt: now, updatedAt: now }],
          null,
          2
        ),
        "utf-8"
      );
      return ws;
    } catch (e: any) {
      return reply.status(409).send({ error: e.message });
    }
  });

  fastify.delete("/workspaces/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ws = registry.get(id);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    registry.delete(id);
    const wsDir = path.join(dataDir, "workspaces", id);
    if (fs.existsSync(wsDir)) {
      fs.rmSync(wsDir, { recursive: true, force: true });
    }
    return { success: true };
  });

  fastify.post("/workspaces/:id/cleanup-tickets", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ws = registry.get(id);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });
    const db = getDb(id);
    const allTickets = await db.select().from(tickets);
    const deleted: string[] = [];
    const kept: string[] = [];
    for (const t of allTickets) {
      if (hasTicketArtifacts(ws.path, t.id)) {
        kept.push(t.id);
      } else {
        await db.delete(actionRuns).where(eq(actionRuns.ticketId, t.id));
        await db.delete(tickets).where(eq(tickets.id, t.id));
        deleted.push(t.id);
      }
    }
    return { deleted, kept, count: deleted.length };
  });
}
