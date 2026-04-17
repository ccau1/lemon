import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConfigManager } from "../config/settings.js";
import type { WorkflowStep } from "@lemon/shared";
import { defaultPrompts } from "../services/workflow.js";

const setSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  workspaceId: z.string().optional(),
});

export async function configRoutes(
  fastify: FastifyInstance,
  { manager }: { manager: ConfigManager }
) {
  fastify.get("/config", async (request) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (workspaceId) {
      return manager.resolve(workspaceId);
    }
    return manager.readGlobal();
  });

  fastify.get("/config/raw", async (request) => {
    const { workspaceId } = request.query as { workspaceId?: string };
    if (!workspaceId) return {};
    return manager.readWorkspace(workspaceId);
  });

  fastify.get("/config/defaults", async () => {
    return { prompts: defaultPrompts };
  });

  fastify.post("/config", async (request, reply) => {
    const body = setSchema.parse(request.body);
    const { key, value, workspaceId } = body;

    const target = workspaceId
      ? manager.readWorkspace(workspaceId)
      : manager.readGlobal();

    const keys = key.split(".");
    let current: any = target;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    if (workspaceId) {
      manager.writeWorkspace(workspaceId, target);
    } else {
      manager.writeGlobal(target as any);
    }

    return { success: true };
  });

  fastify.post("/config/default-model", async (request, reply) => {
    const body = z
      .object({
        step: z.enum(["spec", "plan", "tasks", "implement", "done"]),
        modelId: z.string().min(1),
        workspaceId: z.string().optional(),
      })
      .parse(request.body);

    const target = body.workspaceId
      ? manager.readWorkspace(body.workspaceId)
      : manager.readGlobal();

    if (!target.defaultModels) target.defaultModels = {};
    target.defaultModels[body.step] = body.modelId;

    if (body.workspaceId) {
      manager.writeWorkspace(body.workspaceId, target);
    } else {
      manager.writeGlobal(target as any);
    }

    return { success: true };
  });
}
