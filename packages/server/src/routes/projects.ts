import type { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "fs";
import path from "path";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";

const createSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1),
});

const renameSchema = z.object({
  name: z.string().min(1),
});

function projectsPath(dataDir: string, workspaceId: string): string {
  return path.join(dataDir, "workspaces", workspaceId, "projects.json");
}

function readProjects(dataDir: string, workspaceId: string): Array<{
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}> {
  const p = projectsPath(dataDir, workspaceId);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeProjects(
  dataDir: string,
  workspaceId: string,
  projects: Array<{
    id: string;
    workspaceId: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>
): void {
  const p = projectsPath(dataDir, workspaceId);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(p, JSON.stringify(projects, null, 2), "utf-8");
}

export async function projectRoutes(
  fastify: FastifyInstance,
  {
    dataDir,
    registry,
  }: { dataDir: string; registry: WorkspaceRegistry }
) {
  fastify.get("/projects", async (request) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return [];
    return readProjects(dataDir, workspaceId);
  });

  fastify.post("/projects", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const ws = registry.get(body.workspaceId);
    if (!ws) return reply.status(404).send({ error: "Workspace not found" });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const projects = readProjects(dataDir, body.workspaceId);
    projects.push({ id, workspaceId: body.workspaceId, name: body.name, createdAt: now, updatedAt: now });
    writeProjects(dataDir, body.workspaceId, projects);
    return { id, workspaceId: body.workspaceId, name: body.name, createdAt: now, updatedAt: now };
  });

  fastify.get("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const projects = readProjects(dataDir, workspaceId);
    const row = projects.find((p) => p.id === id);
    if (!row) return reply.status(404).send({ error: "Project not found" });
    return row;
  });

  fastify.patch("/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return reply.status(400).send({ error: "workspaceId required" });
    const body = renameSchema.parse(request.body);
    const projects = readProjects(dataDir, workspaceId);
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return reply.status(404).send({ error: "Project not found" });
    const now = new Date().toISOString();
    projects[idx] = { ...projects[idx], name: body.name, updatedAt: now };
    writeProjects(dataDir, workspaceId, projects);
    return projects[idx];
  });
}
