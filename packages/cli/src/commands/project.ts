import type { ApiClient } from "../api-client.js";

export async function projectList(client: ApiClient, workspaceId: string) {
  const projects = await client.getProjects(workspaceId);
  console.log("Projects:");
  for (const p of projects) {
    console.log(`  ${p.id} | ${p.name}`);
  }
}

export async function projectCreate(
  client: ApiClient,
  workspaceId: string,
  name: string
) {
  const p = await client.createProject({ workspaceId, name });
  console.log("Created project:", p);
}
