import type { ApiClient } from "../api-client.js";

export async function configGet(client: ApiClient, workspaceId?: string) {
  const cfg = await client.getConfig(workspaceId);
  console.log(JSON.stringify(cfg, null, 2));
}

export async function configSet(
  client: ApiClient,
  key: string,
  value: string,
  workspaceId?: string
) {
  let parsed: any = value;
  if (value === "true") parsed = true;
  else if (value === "false") parsed = false;
  else if (!isNaN(Number(value))) parsed = Number(value);

  await client.setConfig({ key, value: parsed, workspaceId });
  console.log("Set", key, "=", parsed);
}
