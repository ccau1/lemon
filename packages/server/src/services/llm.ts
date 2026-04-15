import { spawn } from "node:child_process";
import OpenAI from "openai";
import type { ModelConfig, WorkflowStep } from "@lemon/shared";
import { ModelRegistry } from "../config/model-registry.js";
import { ConfigManager } from "../config/settings.js";
import type { DB } from "../db/index.js";
import { stepModelOverrides } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export class LlmService {
  private clients = new Map<string, OpenAI>();

  constructor(
    private modelRegistry: ModelRegistry,
    private configManager: ConfigManager
  ) {}

  async resolveModel(
    workspaceId: string,
    projectId: string,
    step: WorkflowStep,
    db: DB
  ): Promise<ModelConfig | undefined> {
    // 1. Check per-project/step override
    const override = await db.query.stepModelOverrides.findFirst({
      where: and(
        eq(stepModelOverrides.projectId, projectId),
        eq(stepModelOverrides.step, step)
      ),
    });
    if (override) {
      return this.modelRegistry.get(override.modelId);
    }

    // 2. Check workspace/default config for step
    const settings = this.configManager.resolve(workspaceId);
    const defaultModelId = settings.defaultModels[step];
    if (defaultModelId) {
      return this.modelRegistry.get(defaultModelId);
    }

    // 3. Fallback to any registered model
    const all = this.modelRegistry.list();
    return all[0];
  }

  private getClient(config: ModelConfig): OpenAI {
    const key = config.id;
    if (!this.clients.has(key)) {
      this.clients.set(
        key,
        new OpenAI({
          apiKey: config.apiKey ?? "sk-no-key",
          baseURL: config.baseUrl,
        })
      );
    }
    return this.clients.get(key)!;
  }

  private isCliProvider(config: ModelConfig): boolean {
    return config.provider === "claude-code-cli" || config.provider === "kimi-code-cli";
  }

  private getCliCommand(config: ModelConfig): [string, string[]] {
    if (config.provider === "claude-code-cli") {
      return [config.modelId, ["-p"]];
    }
    if (config.provider === "kimi-code-cli") {
      return [config.modelId, ["-p"]];
    }
    throw new Error(`Unknown CLI provider: ${config.provider}`);
  }

  private formatCliPrompt(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): string {
    return messages
      .map((m) => {
        const label = m.role === "system" ? "System" : m.role === "user" ? "User" : "Assistant";
        return `=== ${label} ===\n${m.content}`;
      })
      .join("\n\n");
  }

  private async chatCli(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<string> {
    const prompt = this.formatCliPrompt(messages);
    const [cmd, args] = this.getCliCommand(config);
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data) => {
        stdout += data;
      });
      child.stderr.on("data", (data) => {
        stderr += data;
      });
      child.on("error", (err) => reject(new Error(`Failed to spawn ${cmd}: ${err.message}`)));
      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`${config.provider} exited with code ${code}: ${stderr || stdout}`));
        } else {
          resolve(stdout.trim());
        }
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private async chatStreamCli(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<AsyncIterable<string>> {
    const prompt = this.formatCliPrompt(messages);
    const [cmd, args] = this.getCliCommand(config);
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.stdin.write(prompt);
    child.stdin.end();

    return (async function* () {
      for await (const chunk of child.stdout) {
        yield chunk.toString();
      }
      const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
      if (code !== 0) {
        throw new Error(`${config.provider} exited with code ${code}: ${stderr}`);
      }
    })();
  }

  async chat(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<string> {
    if (this.isCliProvider(config)) {
      return this.chatCli(config, messages);
    }

    const client = this.getClient(config);
    const body: any = {
      model: config.modelId,
      messages: messages as any,
    };
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    const response = await client.chat.completions.create(body);
    return response.choices[0]?.message?.content ?? "";
  }

  async chatStream(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>
  ): Promise<AsyncIterable<string>> {
    if (this.isCliProvider(config)) {
      return this.chatStreamCli(config, messages);
    }

    const client = this.getClient(config);
    const body: any = {
      model: config.modelId,
      messages: messages as any,
      stream: true,
    };
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    const stream = await client.chat.completions.create(body) as any;

    return (async function* () {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      }
    })();
  }
}
