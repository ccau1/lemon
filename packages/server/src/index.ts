import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import path from "path";
import os from "os";

import { WorkspaceRegistry } from "./config/workspace-registry.js";
import { ConfigManager } from "./config/settings.js";
import { ModelRegistry } from "./config/model-registry.js";
import { IntegrationRegistry } from "./config/integration-registry.js";
import { resolveDataDir } from "./config/datadir.js";
import { getWorkspaceDb } from "./db/index.js";
import { LlmService } from "./services/llm.js";
import { WorkflowEngine } from "./services/workflow.js";
import { ActionRunQueue } from "./services/action-run-queue.js";
import { EventDispatcher } from "./services/event-dispatcher.js";
import { ActionTriggerService } from "./services/action-trigger.js";
import type { WorkflowStep } from "@lemon/shared";
import { migrateArtifactsToFiles } from "./db/migrate-to-files.js";

import { workspaceRoutes } from "./routes/workspaces.js";
import { projectRoutes } from "./routes/projects.js";
import { ticketRoutes } from "./routes/tickets.js";
import { modelRoutes } from "./routes/models.js";
import { configRoutes } from "./routes/config.js";
import { workflowRoutes } from "./routes/workflow.js";
import { testRoutes } from "./routes/test.js";
import { actionRoutes } from "./routes/actions.js";
import { themeRoutes } from "./routes/themes.js";
import { docsRoutes } from "./routes/docs.js";
import { integrationRoutes } from "./routes/integrations.js";
import { serverInfoRoutes } from "./routes/server-info.js";

export interface ServerOptions {
  port: number;
  dataDir: string;
}

export async function startServer(options: ServerOptions) {
  const app = Fastify({ logger: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  await app.register(websocket);

  const workspaceRegistry = new WorkspaceRegistry(options.dataDir);
  const configManager = new ConfigManager(
    options.dataDir,
    (id) => workspaceRegistry.get(id)?.path
  );
  const modelRegistry = new ModelRegistry(options.dataDir);
  const integrationRegistry = new IntegrationRegistry(options.dataDir);

  // Seed default model on first bootstrap
  const existingModels = modelRegistry.list();
  if (existingModels.length === 0) {
    const defaultModel = modelRegistry.add({
      name: "claude-code",
      provider: "claude-code-cli",
      modelId: "claude",
    });

    const globalConfig = configManager.readGlobal();
    const steps: WorkflowStep[] = ["spec", "plan", "tasks", "implement", "done"];
    for (const step of steps) {
      globalConfig.defaultModels[step] = defaultModel.id;
    }
    configManager.writeGlobal(globalConfig);
  }

  const llmService = new LlmService(modelRegistry, configManager);

  // One-time migration: move artifact data from old DB tables to ticket folders
  await migrateArtifactsToFiles(options.dataDir, workspaceRegistry, configManager);

  const getDb = (workspaceId: string) =>
    getWorkspaceDb(options.dataDir, workspaceId);

  const connections = new Set<any>();

  const broadcast = (event: string, payload: unknown) => {
    const message = JSON.stringify({ event, payload });
    for (const socket of connections) {
      try {
        socket.send(message);
      } catch {
        // ignore closed connections
      }
    }
  };

  const eventDispatcher = new EventDispatcher(integrationRegistry);
  const workflowEngine = new WorkflowEngine(getDb, llmService, configManager, broadcast, workspaceRegistry, eventDispatcher);
  const actionRunQueue = new ActionRunQueue(getDb, llmService, configManager, modelRegistry, workspaceRegistry);

  const actionTriggerService = new ActionTriggerService(
    getDb,
    configManager,
    actionRunQueue,
    workspaceRegistry,
    (workspaceId, ticketId) => workflowEngine.resumeTicket(workspaceId, ticketId)
  );
  workflowEngine.setActionTriggerService(actionTriggerService);
  actionRunQueue.setActionTriggerService(actionTriggerService);

  await actionRunQueue.recover(workspaceRegistry);
  await actionTriggerService.recoverTickets();

  // Register routes
  await workspaceRoutes(app, { registry: workspaceRegistry, dataDir: options.dataDir });
  await projectRoutes(app, { dataDir: options.dataDir, registry: workspaceRegistry });
  await ticketRoutes(app, { getDb, registry: workspaceRegistry, engine: workflowEngine, dispatcher: eventDispatcher });
  await modelRoutes(app, { registry: modelRegistry });
  await configRoutes(app, { manager: configManager });
  await workflowRoutes(app, { getDb, llm: llmService, engine: workflowEngine, configManager, broadcast, workspaceRegistry, dispatcher: eventDispatcher });
  await testRoutes(app);
  await actionRoutes(app, { getDb, configManager, llm: llmService, modelRegistry, workspaceRegistry, actionRunQueue });
  await themeRoutes(app, { dataDir: options.dataDir });
  await docsRoutes(app);
  await integrationRoutes(app, { registry: integrationRegistry });
  await serverInfoRoutes(app);

  // Health check endpoint
  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok" });
  });

  app.get("/api/health", async (_request, reply) => {
    return reply.send({ status: "ok" });
  });

  // WebSocket gateway for real-time updates
  app.get("/ws", { websocket: true }, (connection: any) => {
    // Defensive: v11 passes the raw ws socket as `connection`, older versions pass SocketStream with `.socket`
    const socket = connection.socket || connection;
    connections.add(socket);
    socket.on("close", () => {
      connections.delete(socket);
    });
    socket.on("error", () => {});
  });

  await app.listen({ port: options.port, host: "0.0.0.0" });
  app.log.info(`Server listening on http://localhost:${options.port}`);
  return app;
}

export { resolveDataDir } from "./config/datadir.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000);
  const dataDir = resolveDataDir(process.env.DATA_DIR);
  startServer({ port, dataDir });
}
