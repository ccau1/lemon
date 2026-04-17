import fs from "node:fs";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import type { ModelConfig, WorkflowStep } from "@lemon/shared";
import { ModelRegistry } from "../config/model-registry.js";
import { ConfigManager } from "../config/settings.js";

export class LlmService {
  private clients = new Map<string, OpenAI>();

  constructor(
    private modelRegistry: ModelRegistry,
    private configManager: ConfigManager
  ) {}

  async resolveModel(
    workspaceId: string,
    projectId: string,
    step: WorkflowStep
  ): Promise<ModelConfig | undefined> {
    // 1. Check per-project/step override in workspace config
    const overrides = this.configManager.resolve(workspaceId).stepModelOverrides[projectId];
    if (overrides?.[step]) {
      return this.modelRegistry.get(overrides[step]);
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
      // --dangerously-skip-permissions: auto-approve all file/shell operations
      // -p: non-interactive print mode (prompt passed as the following arg)
      return [config.modelId, ["--dangerously-skip-permissions", "-p"]];
    }
    if (config.provider === "kimi-code-cli") {
      // --print: non-interactive mode (implicitly enables auto-approval)
      // --yolo: explicit auto-approval (safeguards against config overriding the CLI flag)
      // --prompt: pass prompt text explicitly so it never gets parsed as a flag
      return [config.modelId, ["--print", "--yolo", "--prompt"]];
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
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    workspacePath?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const prompt = this.formatCliPrompt(messages);
    const [cmd, baseArgs] = this.getCliCommand(config);
    const args = [...baseArgs, prompt];
    const TIMEOUT_MS = 300_000; // 5 minutes
    // DEBUG: log exact command being spawned
    const debugLog = `/tmp/lemon-llm-debug-${Date.now()}.log`;
    fs.writeFileSync(debugLog, `[LLM DEBUG] Spawning: ${cmd} ${args.map(a => a.length > 50 ? a.slice(0, 50) + "..." : a).join(" ")}\n`);
    fs.appendFileSync(debugLog, `[LLM DEBUG] cwd: ${workspacePath || process.cwd()}\n`);
    fs.appendFileSync(debugLog, `[LLM DEBUG] PATH: ${process.env.PATH}\n`);
    console.error(`[LLM DEBUG] Spawning: ${cmd} ${args.map(a => a.length > 50 ? a.slice(0, 50) + "..." : a).join(" ")}`);
    console.error(`[LLM DEBUG] cwd: ${workspacePath || process.cwd()}`);
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd: workspacePath });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`${config.provider} timed out after ${TIMEOUT_MS / 1000}s`));
      }, TIMEOUT_MS);
      const onAbort = () => {
        clearTimeout(timeout);
        child.kill("SIGTERM");
        reject(new Error("Run cancelled by user"));
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort);
      }
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (data) => {
        stdout += data;
      });
      child.stderr.on("data", (data) => {
        stderr += data;
      });
      child.on("error", (err: any) => {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener("abort", onAbort);
        if (err.code === "ENOENT" && err.syscall === "spawn") {
          reject(new Error(`Command '${cmd}' not found. Please install it or check your PATH.`));
        } else {
          reject(new Error(`Failed to spawn ${cmd}: ${err.message}`));
        }
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener("abort", onAbort);
        fs.appendFileSync(debugLog, `[LLM DEBUG] Exit code: ${code}\n`);
        fs.appendFileSync(debugLog, `[LLM DEBUG] Stderr: ${stderr.slice(0, 2000)}\n`);
        fs.appendFileSync(debugLog, `[LLM DEBUG] Stdout: ${stdout.slice(0, 5000)}\n`);
        console.error(`[LLM DEBUG] Exit code: ${code}`);
        console.error(`[LLM DEBUG] Stderr: ${stderr.slice(0, 500)}`);
        console.error(`[LLM DEBUG] Stdout prefix: ${stdout.slice(0, 200)}`);
        if (code !== 0) {
          reject(new Error(`${config.provider} exited with code ${code}: ${stderr || stdout}`));
        } else {
          resolve(stdout.trim());
        }
      });
      child.stdin.end();
    });
  }

  private async chatStreamCli(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    workspacePath?: string,
    signal?: AbortSignal
  ): Promise<AsyncIterable<string>> {
    const prompt = this.formatCliPrompt(messages);
    const [cmd, baseArgs] = this.getCliCommand(config);
    const args = [...baseArgs, prompt];
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd: workspacePath });
    let stderr = "";
    const onAbort = () => {
      child.kill("SIGTERM");
      stderr = "Run cancelled by user";
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort);
      }
    }
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("error", (err: any) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (err.code === "ENOENT" && err.syscall === "spawn") {
        stderr = `Command '${cmd}' not found. Please install it or check your PATH.`;
      } else {
        stderr = `Failed to spawn ${cmd}: ${err.message}`;
      }
    });
    child.stdin.end();

    return (async function* () {
      try {
        for await (const chunk of child.stdout) {
          if (signal?.aborted) break;
          yield chunk.toString();
        }
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
      const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
      if (code !== 0 || stderr) {
        throw new Error(`${config.provider} exited with code ${code}: ${stderr}`);
      }
    })();
  }

  async chat(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    workspacePath?: string,
    signal?: AbortSignal
  ): Promise<{ content: string; durationMs: number }> {
    const startedAt = Date.now();
    if (this.isCliProvider(config)) {
      const content = await this.chatCli(config, messages, workspacePath, signal);
      return { content, durationMs: Date.now() - startedAt };
    }

    const client = this.getClient(config);
    const body: any = {
      model: config.modelId,
      messages: messages as any,
    };
    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }
    const response = await client.chat.completions.create(body, { timeout: 300_000, signal });
    const content = response.choices[0]?.message?.content ?? "";
    return { content, durationMs: Date.now() - startedAt };
  }

  async chatStream(
    config: ModelConfig,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    workspacePath?: string,
    signal?: AbortSignal
  ): Promise<AsyncIterable<string>> {
    if (this.isCliProvider(config)) {
      return this.chatStreamCli(config, messages, workspacePath, signal);
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
    const stream = await client.chat.completions.create(body, { signal }) as any;

    return (async function* () {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield content;
      }
    })();
  }
}
