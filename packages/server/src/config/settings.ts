import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { z } from "zod";
import { settingsSchema, actionMessageSchema, type Settings, type WorkflowStep, type ActionMessage } from "@lemon/shared";

const actionsSchema = z.record(z.string(), z.array(actionMessageSchema));

export class ConfigManager {
  constructor(
    private dataDir: string,
    private getWorkspacePath?: (workspaceId: string) => string | undefined
  ) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private globalPath(): string {
    return path.join(this.dataDir, "config.yaml");
  }

  private workspacePath(workspaceId: string): string {
    return path.join(this.dataDir, "workspaces", workspaceId, "config.yaml");
  }

  private workspaceActionsPath(workspaceId: string): string {
    return path.join(this.dataDir, "workspaces", workspaceId, "actions.yaml");
  }

  private repoWorkspacePath(workspaceId: string): string | undefined {
    const wsPath = this.getWorkspacePath?.(workspaceId);
    if (!wsPath) return undefined;
    return path.join(wsPath, ".lemon", "workspace.yaml");
  }

  private repoActionsPath(workspaceId: string): string | undefined {
    const wsPath = this.getWorkspacePath?.(workspaceId);
    if (!wsPath) return undefined;
    return path.join(wsPath, ".lemon", "actions.yaml");
  }

  private readYamlFile(p: string | undefined): Record<string, unknown> | undefined {
    if (!p || !fs.existsSync(p)) return undefined;
    return yaml.load(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
  }

  readGlobal(): Settings {
    const raw = this.readYamlFile(this.globalPath());
    if (!raw) return this.defaults();
    return this.parse(raw);
  }

  readWorkspace(workspaceId: string): Partial<Settings> {
    const dataConfigRaw = this.readYamlFile(this.workspacePath(workspaceId));
    const dataActionsRaw = this.readYamlFile(this.workspaceActionsPath(workspaceId));
    const repoWorkspaceRaw = this.readYamlFile(this.repoWorkspacePath(workspaceId));
    const repoActionsRaw = this.readYamlFile(this.repoActionsPath(workspaceId));

    const dataConfig = dataConfigRaw ? this.parsePartial(dataConfigRaw) : {};
    const dataActions = dataActionsRaw ? { actions: actionsSchema.parse(dataActionsRaw) } : {};
    const repoConfig = repoWorkspaceRaw ? this.parsePartial(repoWorkspaceRaw) : {};
    const repoActions = repoActionsRaw ? { actions: actionsSchema.parse(repoActionsRaw) } : {};

    return this.mergeSettingsPartials(dataConfig, dataActions, repoConfig, repoActions);
  }

  resolveContextGlobs(workspaceId: string, step: WorkflowStep): string[] {
    const settings = this.resolve(workspaceId);
    const globs = settings.contextGlobs;
    if (Array.isArray(globs)) {
      return globs;
    }
    return globs[step] ?? globs["default"] ?? [];
  }

  resolve(workspaceId: string): Settings {
    const global = this.readGlobal();
    const workspace = this.readWorkspace(workspaceId);
    return {
      actions: { ...global.actions, ...workspace.actions },
      autoApprove: { ...global.autoApprove, ...workspace.autoApprove },
      defaultModels: { ...global.defaultModels, ...workspace.defaultModels },
      parallelConcurrency:
        workspace.parallelConcurrency ?? global.parallelConcurrency,
      contextGlobs: this.mergeContextGlobs(global.contextGlobs, workspace.contextGlobs),
      theme: workspace.theme ?? global.theme,
    };
  }

  private mergeContextGlobs(
    global: Settings["contextGlobs"],
    workspace: Settings["contextGlobs"] | undefined
  ): Settings["contextGlobs"] {
    if (!workspace) return global;
    if (Array.isArray(workspace)) return workspace;
    if (Array.isArray(global)) {
      return { default: global, ...workspace };
    }
    return { ...global, ...workspace };
  }

  private mergeSettingsPartials(...partials: Partial<Settings>[]): Partial<Settings> {
    const result: Partial<Settings> = {};
    for (const partial of partials) {
      if (partial.actions !== undefined) {
        result.actions = { ...result.actions, ...partial.actions };
      }
      if (partial.autoApprove !== undefined) {
        result.autoApprove = { ...result.autoApprove, ...partial.autoApprove };
      }
      if (partial.defaultModels !== undefined) {
        result.defaultModels = { ...result.defaultModels, ...partial.defaultModels };
      }
      if (partial.parallelConcurrency !== undefined) {
        result.parallelConcurrency = partial.parallelConcurrency;
      }
      if (partial.contextGlobs !== undefined) {
        result.contextGlobs = partial.contextGlobs;
      }
      if (partial.theme !== undefined) {
        result.theme = partial.theme;
      }
    }
    return result;
  }

  writeGlobal(settings: Settings): void {
    const p = this.globalPath();
    fs.writeFileSync(p, yaml.dump(settings), "utf-8");
  }

  writeWorkspace(workspaceId: string, settings: Partial<Settings>): void {
    const { actions, ...rest } = settings;

    const configPath = this.workspacePath(workspaceId);
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, yaml.dump(rest), "utf-8");

    if (actions !== undefined) {
      const actionsPath = this.workspaceActionsPath(workspaceId);
      fs.writeFileSync(actionsPath, yaml.dump(actions), "utf-8");
    }
  }

  private defaults(): Settings {
    return {
      actions: {},
      autoApprove: {
        spec: false,
        plan: false,
        tasks: false,
        implement: false,
        done: false,
      },
      defaultModels: {},
      parallelConcurrency: 3,
      contextGlobs: {
        default: [
          "README.md",
          "docs/**/*.md",
          "package.json",
          "Cargo.toml",
          "pyproject.toml",
          "*.config.*",
        ],
      },
      theme: "dark",
    };
  }

  private parse(raw: Record<string, unknown>): Settings {
    if (raw.theme === "default") raw.theme = "dark";
    return settingsSchema.parse(raw);
  }

  resolveAllActions(): Record<string, ActionMessage[]> {
    const global = this.readGlobal();
    const result: Record<string, ActionMessage[]> = { ...global.actions };
    const workspacesDir = path.join(this.dataDir, "workspaces");
    if (fs.existsSync(workspacesDir)) {
      for (const id of fs.readdirSync(workspacesDir)) {
        const wsPath = path.join(workspacesDir, id);
        if (fs.statSync(wsPath).isDirectory()) {
          const ws = this.readWorkspace(id);
          if (ws.actions) {
            Object.assign(result, ws.actions);
          }
        }
      }
    }
    return result;
  }

  private parsePartial(raw: Record<string, unknown>): Partial<Settings> {
    return settingsSchema.partial().parse(raw);
  }
}
