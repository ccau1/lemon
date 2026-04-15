import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { projects } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";

const createSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
});

const renameSchema = z.object({
  name: z.string().min(1),
});

export async function projectRoutes(
  fastify: FastifyInstance,
  {
    getDb,
    registry,
  }: { getDb: (workspaceId: string) => DB; registry: WorkspaceRegistry }
) {
  fastify.get("/projects", async (request) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return [];
    const db = getDb(workspaceId);
    return db.select().from(projects).where(eq(projects.workspaceId, workspaceId));
  });

  fastify.post("/projects", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const ws = registry.get(body.workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });

    const db = getDb(body.workspaceId);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(projects).values({
      id,
      workspaceId: body.workspaceId,
      name: body.name,
      createdAt: now,
      updatedAt: now,
    });
    return { id, workspaceId: body.workspaceId, name: body.name, createdAt: now, updatedAt: now };
  });

  fastify.get("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const db = getDb(workspaceId);
    const row = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    if (!row) return reply.status(404).send({ error: "Project not found" });
    return row;
  });

  fastify.patch("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = renameSchema.parse(request.body);
    const db = getDb(workspaceId);
    const now = new Date().toISOString();
    await db.update(projects).set({ name: body.name, updatedAt: now }).where(eq(projects.id, id));
    const row = await db.query.projects.findFirst({ where: eq(projects.id, id) });
    if (!row) return reply.status(404).send({ error: "Project not found" });
    return row;
  });
}
