import type { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "fs";
import path from "path";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";

const createSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

function projectsPath(dataDir: string, workspaceId: string): string {
  return path.join(dataDir, "workspaces", workspaceId, "projects.json");
}

export async function workspaceRoutes(
  fastify: FastifyInstance,
  { registry, dataDir }: { registry: WorkspaceRegistry; dataDir: string }
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
    registry.delete(id);
    return { success: true };
  });
}
