import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { IntegrationRegistry } from "../config/integration-registry.js";
import { integrationRegistry } from "@lemon/shared";

const integrationTypes = integrationRegistry;

const createSchema = z.object({
  type: z.enum(["jira", "shortcut"]),
  enabled: z.boolean().default(true),
  name: z.string().min(1),
  config: z.record(z.any()).default({}),
});

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
  config: z.record(z.any()).optional(),
});

export async function integrationRoutes(
  fastify: FastifyInstance,
  { registry }: { registry: IntegrationRegistry }
) {
  fastify.get("/integrations", async () => {
    const all = registry.list();
    return all.map((i) => {
      const def = integrationTypes[i.type as keyof typeof integrationTypes];
      const secretNames = def?.form.fields.filter((f) => f.type === "secret").map((f) => f.name) ?? [];
      return {
        ...i,
        config: registry.redactSecrets(i.config, secretNames),
        ticketCreate: def?.ticketCreate,
        ticketImport: def?.ticketImport,
      };
    });
  });

  fastify.get("/integrations/types", async () => {
    return Object.values(integrationTypes).map((def) => ({
      id: def.id,
      name: def.name,
      description: def.description,
      form: def.form,
      ticketCreate: def.ticketCreate,
      ticketImport: def.ticketImport,
    }));
  });

  fastify.post("/integrations", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const def = integrationTypes[body.type];
    if (!def) {
      return reply.status(400).send({ error: "Unknown integration type" });
    }
    const secretNames = def.form.fields.filter((f) => f.type === "secret").map((f) => f.name);
    const encryptedConfig = registry.encryptSecrets(body.config, secretNames);
    const item = registry.add({ ...body, config: encryptedConfig });
    return item;
  });

  fastify.patch("/integrations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSchema.parse(request.body);
    const existing = registry.get(id);
    if (!existing) {
      return reply.status(404).send({ error: "Integration not found" });
    }

    const def = integrationTypes[existing.type as keyof typeof integrationTypes];
    const secretNames = def?.form.fields.filter((f) => f.type === "secret").map((f) => f.name) ?? [];

    let config = body.config;
    if (config) {
      // For secret fields, keep existing encrypted values if the update sends a redacted placeholder
      const prevDecrypted = registry.decryptSecrets(existing.config, secretNames);
      for (const key of secretNames) {
        if (config[key] === "***REDACTED***") {
          config[key] = prevDecrypted[key];
        }
      }
      config = registry.encryptSecrets(config, secretNames);
    }

    const updated = registry.update(id, { ...body, config });
    if (!updated) {
      return reply.status(404).send({ error: "Integration not found" });
    }
    return { ...updated, config: registry.redactSecrets(updated.config, secretNames) };
  });

  fastify.delete("/integrations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = registry.remove(id);
    if (!ok) {
      return reply.status(404).send({ error: "Integration not found" });
    }
    return { success: true };
  });

  fastify.get("/integrations/:id/search", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { q } = request.query as { q?: string };
    const integration = registry.get(id);
    if (!integration) {
      return reply.status(404).send({ error: "Integration not found" });
    }
    const def = integrationTypes[integration.type as keyof typeof integrationTypes];
    if (!def || !def.ticketImport?.enabled || !def.importSearch) {
      return reply.status(400).send({ error: "Integration does not support ticket import" });
    }

    const secretNames = def.form.fields.filter((f) => f.type === "secret").map((f) => f.name);
    const decryptedConfig = registry.decryptSecrets(integration.config, secretNames);

    const results = await def.importSearch(q || "", decryptedConfig);
    return { results };
  });
}
