import type { ApiClient } from "../api-client.js";
import fs from "fs";
import path from "path";
import os from "os";

const DEFAULT_FILE = path.join(os.homedir(), ".lemon", ".default_workspace");

function getDefaultWorkspaceId(): string | undefined {
  if (fs.existsSync(DEFAULT_FILE)) {
    return fs.readFileSync(DEFAULT_FILE, "utf-8").trim();
  }
}

function setDefaultWorkspaceId(id: string) {
  fs.mkdirSync(path.dirname(DEFAULT_FILE), { recursive: true });
  fs.writeFileSync(DEFAULT_FILE, id, "utf-8");
}

export async function workspaceList(client: ApiClient) {
  const workspaces = await client.getWorkspaces();
  const defaultId = getDefaultWorkspaceId();
  console.log("Workspaces:");
  for (const w of workspaces) {
    const marker = w.id === defaultId ? " *" : "";
    console.log(`  ${w.id}${marker} | ${w.name} | ${w.path}`);
  }
}

export async function workspaceCreate(
  client: ApiClient,
  name: string,
  repoPath: string
) {
  const ws = await client.createWorkspace({ name, path: repoPath });
  console.log("Created workspace:", ws);
}

export async function workspaceUse(id: string) {
  setDefaultWorkspaceId(id);
  console.log("Default workspace set to:", id);
}

export async function workspaceDelete(client: ApiClient, id: string) {
  await client.deleteWorkspace(id);
  console.log("Deleted workspace:", id);
}

export { getDefaultWorkspaceId };
