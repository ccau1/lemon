import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { actionRuns } from "../db/schema.js";
import type { DB } from "../db/index.js";
import type { ConfigManager } from "../config/settings.js";
import type { WorkspaceRegistry } from "../config/workspace-registry.js";
import type { LlmService } from "../services/llm.js";
import type { ModelRegistry } from "../config/model-registry.js";
import { ActionRunQueue } from "../services/action-run-queue.js";

const runSchema = z.object({
  workspaceId: z.string().min(1),
  actionName: z.string().min(1),
  ticketId: z.string().optional(),
  modelId: z.string().optional(),
});

export async function actionRoutes(
  fastify: FastifyInstance,
  {
    getDb,
    configManager,
    llm,
    modelRegistry,
    workspaceRegistry,
    actionRunQueue,
  }: {
    getDb: (workspaceId: string) => DB;
    configManager: ConfigManager;
    llm: LlmService;
    modelRegistry: ModelRegistry;
    workspaceRegistry: WorkspaceRegistry;
    actionRunQueue: ActionRunQueue;
  }
) {
  fastify.get("/actions", async () => {
    return configManager.resolveAllActions();
  });

  fastify.post("/actions/run", async (request, reply) => {
    const body = runSchema.parse(request.body);
    const { workspaceId, actionName, ticketId, modelId } = body;

    const actions = configManager.resolveAllActions();
    const messages = actions[actionName];
    if (!messages) {
      return reply.status(404).send({ error: "Action not found" });
    }

    const result = await actionRunQueue.enqueue({
      workspaceId,
      actionName,
      ticketId,
      modelId,
      messages,
    });

    return result;
  });

  fastify.get("/actions/runs", async (request, reply) => {
    const { workspaceId, actionName } = request.query as {
      workspaceId?: string;
      actionName?: string;
    };

    const fetchRuns = async (db: DB, wsId: string) => {
      const conditions = [eq(actionRuns.workspaceId, wsId)];
      if (actionName) {
        conditions.push(eq(actionRuns.actionName, actionName));
      }
      return db.query.actionRuns.findMany({
        where: (runs, { and }) => and(...conditions),
        orderBy: [desc(actionRuns.createdAt)],
      });
    };

    if (workspaceId) {
      const db = getDb(workspaceId);
      return fetchRuns(db, workspaceId);
    }

    const workspaces = workspaceRegistry.list();
    const allRuns: Awaited<ReturnType<typeof fetchRuns>> = [];
    for (const ws of workspaces) {
      const db = getDb(ws.id);
      const rows = await fetchRuns(db, ws.id);
      allRuns.push(...rows);
    }
    allRuns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return allRuns;
  });
}
