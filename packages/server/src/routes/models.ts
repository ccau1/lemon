import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelRegistry } from "../config/model-registry.js";

const createSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "openai-compatible", "claude-code-cli", "kimi-code-cli", "ollama", "qwen", "gemini"]),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  modelId: z.string().min(1),
  temperature: z.number().optional(),
});

export async function modelRoutes(
  fastify: FastifyInstance,
  { registry }: { registry: ModelRegistry }
) {
  fastify.get("/models", async () => {
    return registry.list();
  });

  fastify.get("/models/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const m = registry.get(id);
    if (!m) return reply.status(404).send({ error: "Model not found" });
    return m;
  });

  fastify.post("/models", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const m = registry.add(body);
    return m;
  });

  fastify.patch("/models/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createSchema.partial().parse(request.body);
    const updated = registry.update(id, body);
    if (!updated) return reply.status(404).send({ error: "Model not found" });
    return updated;
  });

  fastify.delete("/models/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = registry.remove(id);
    if (!ok) return reply.status(404).send({ error: "Model not found" });
    return { success: true };
  });

  fastify.patch("/models/reorder", async (request) => {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(request.body);
    registry.reorder(ids);
    return { success: true };
  });
}
