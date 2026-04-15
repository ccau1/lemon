import fs from "fs";
import path from "path";
import type { ModelConfig } from "@lemon/shared";

const MODELS_FILE = "models.json";

const BUILTIN_MODELS: ModelConfig[] = [
  {
    id: "__builtin_claude_code__",
    name: "claude-code",
    provider: "claude-code-cli",
    modelId: "claude",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export class ModelRegistry {
  constructor(private dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private filePath(): string {
    return path.join(this.dataDir, MODELS_FILE);
  }

  private readAll(): ModelConfig[] {
    const p = this.filePath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf-8")) as ModelConfig[];
  }

  private writeAll(models: ModelConfig[]): void {
    fs.writeFileSync(this.filePath(), JSON.stringify(models, null, 2), "utf-8");
  }

  private mergeBuiltins(persisted: ModelConfig[]): ModelConfig[] {
    const merged = [...persisted];
    for (const builtin of BUILTIN_MODELS) {
      const hasById = persisted.some((m) => m.id === builtin.id);
      const hasByName = persisted.some((m) => m.name === builtin.name);
      if (!hasById && !hasByName) {
        merged.push(builtin);
      }
    }
    return merged;
  }

  list(): ModelConfig[] {
    return this.mergeBuiltins(this.readAll());
  }

  get(id: string): ModelConfig | undefined {
    const all = this.list();
    return all.find((m) => m.id === id) ?? all.find((m) => m.name === id);
  }

  add(config: Omit<ModelConfig, "id" | "createdAt" | "updatedAt">): ModelConfig {
    const all = this.readAll();
    const existingIdx = all.findIndex((m) => m.name === config.name);

    if (existingIdx !== -1) {
      all[existingIdx] = {
        ...all[existingIdx],
        ...config,
        updatedAt: new Date().toISOString(),
      };
      this.writeAll(all);
      return all[existingIdx];
    }

    const model: ModelConfig = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    all.push(model);
    this.writeAll(all);
    return model;
  }

  update(id: string, patch: Partial<Omit<ModelConfig, "id" | "createdAt" | "updatedAt">>): ModelConfig | undefined {
    const all = this.readAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    this.writeAll(all);
    return all[idx];
  }

  remove(id: string): boolean {
    const all = this.readAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    this.writeAll(all);
    return true;
  }

  reorder(ids: string[]): boolean {
    const all = this.readAll();
    const map = new Map(all.map((m) => [m.id, m]));
    const ordered: ModelConfig[] = [];
    for (const id of ids) {
      const m = map.get(id);
      if (m) {
        ordered.push(m);
        map.delete(id);
      }
    }
    // append any models not in ids (preserve relative order)
    for (const m of all) {
      if (map.has(m.id)) ordered.push(m);
    }
    this.writeAll(ordered);
    return true;
  }
}
