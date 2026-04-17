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
import { getWorkspaceDb } from "./db/index.js";
import { LlmService } from "./services/llm.js";
import { WorkflowEngine } from "./services/workflow.js";
import { ActionRunQueue } from "./services/action-run-queue.js";
import { EventDispatcher } from "./services/event-dispatcher.js";
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
    for (const conn of connections) {
      try {
        conn.socket.send(message);
      } catch {
        // ignore closed connections
      }
    }
  };

  const eventDispatcher = new EventDispatcher(integrationRegistry);
  const workflowEngine = new WorkflowEngine(getDb, llmService, configManager, broadcast, workspaceRegistry, eventDispatcher);
  const actionRunQueue = new ActionRunQueue(getDb, llmService, configManager, modelRegistry, workspaceRegistry);
  await actionRunQueue.recover(workspaceRegistry);

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

  // WebSocket gateway for real-time updates
  app.get("/ws", { websocket: true }, (connection: any) => {
    connections.add(connection);
    connection.socket.on("close", () => {
      connections.delete(connection);
    });
  });

  await app.listen({ port: options.port, host: "0.0.0.0" });
  app.log.info(`Server listening on http://localhost:${options.port}`);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3000);
  const dataDir = process.env.DATA_DIR || path.join(os.homedir(), ".lemon");
  startServer({ port, dataDir });
}
