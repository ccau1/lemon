import fs from "fs";
import path from "path";
import type { Workspace } from "@lemon/shared";

const WORKSPACES_FILE = "workspaces.json";

export class WorkspaceRegistry {
  constructor(private dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private filePath(): string {
    return path.join(this.dataDir, WORKSPACES_FILE);
  }

  private readAll(): Workspace[] {
    const p = this.filePath();
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Workspace[];
    return raw.map((w) => ({ ...w, path: path.resolve(w.path) }));
  }

  private writeAll(workspaces: Workspace[]): void {
    fs.writeFileSync(this.filePath(), JSON.stringify(workspaces, null, 2), "utf-8");
  }

  list(): Workspace[] {
    return this.readAll();
  }

  get(id: string): Workspace | undefined {
    return this.readAll().find((w) => w.id === id);
  }

  create(name: string, repoPath: string): Workspace {
    const existing = this.readAll();
    if (existing.some((w) => w.name === name)) {
      throw new Error(`Workspace "${name}" already exists`);
    }
    const absolutePath = path.resolve(repoPath);
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      path: absolutePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    existing.push(workspace);
    this.writeAll(existing);
    return workspace;
  }

  update(id: string, patch: { name?: string; path?: string }): Workspace | undefined {
    const all = this.readAll();
    const idx = all.findIndex((w) => w.id === id);
    if (idx === -1) return undefined;
    const updated = { ...all[idx] };
    if (patch.name !== undefined) updated.name = patch.name;
    if (patch.path !== undefined) updated.path = path.resolve(patch.path);
    updated.updatedAt = new Date().toISOString();
    all[idx] = updated;
    this.writeAll(all);
    return updated;
  }

  delete(id: string): void {
    const filtered = this.readAll().filter((w) => w.id !== id);
    this.writeAll(filtered);
  }
}
