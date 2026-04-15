import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import { projects } from "../db/schema.js";
import type { DB } from "../db/index.js";

const createSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

export async function workspaceRoutes(
  fastify: FastifyInstance,
  { registry, getDb }: { registry: WorkspaceRegistry; getDb: (workspaceId: string) => DB }
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

  fastify.post("/workspaces", async (request, reply) => {
    const body = createSchema.parse(request.body);
    try {
      const ws = registry.create(body.name, body.path);
      const db = getDb(ws.id);
      const now = new Date().toISOString();
      await db.insert(projects).values({
        id: crypto.randomUUID(),
        workspaceId: ws.id,
        name: "default",
        createdAt: now,
        updatedAt: now,
      });
      return ws;
    } catch (e: any) {
      return reply.status(409).send({ error: e.message });
    }
  });

  fastify.delete("/workspaces/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    registry.delete(id);
    return { success: true };
  });
}
