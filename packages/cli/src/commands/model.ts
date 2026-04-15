import type { ApiClient } from "../api-client.js";

export async function modelList(client: ApiClient) {
  const models = await client.getModels();
  console.log("Models:");
  for (const m of models) {
    console.log(`  ${m.id} | ${m.name} (${m.provider}/${m.modelId})`);
  }
}

export async function modelAdd(
  client: ApiClient,
  args: {
    name: string;
    provider: string;
    modelId: string;
    baseUrl?: string;
    apiKey?: string;
  }
) {
  const m = await client.createModel({
    name: args.name,
    provider: args.provider,
    modelId: args.modelId,
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
  });
  console.log("Added model:", m);
}

export async function modelDefault(
  client: ApiClient,
  step: string,
  modelId: string,
  workspaceId?: string
) {
  await client.setDefaultModel({ step, modelId, workspaceId });
  console.log("Set default model for", step, "to", modelId);
}

export async function modelDefaultAll(
  client: ApiClient,
  modelId: string,
  workspaceId?: string
) {
  const steps = ["spec", "plan", "tasks", "implement", "done"];
  for (const step of steps) {
    await client.setDefaultModel({ step, modelId, workspaceId });
    console.log("Set default model for", step, "to", modelId);
  }
}
