import { openaiProvider } from "./openai/index.js";
import { anthropicProvider } from "./anthropic/index.js";
import { openaiCompatibleProvider } from "./openai-compatible/index.js";
import { claudeCodeCliProvider } from "./claude-code-cli/index.js";
import { kimiCodeCliProvider } from "./kimi-code-cli/index.js";
import { ollamaProvider } from "./ollama/index.js";
import { qwenProvider } from "./qwen/index.js";
import { geminiProvider } from "./gemini/index.js";

export interface CliHandlerConfig {
  modelId: string;
}

export interface CliHandler {
  getCommand(config: CliHandlerConfig): [string, string[]];
  enrichError?(stderr: string, stdout: string): string | Promise<string>;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  category: "api" | "cli";
  icon: string;
}

export const providers = [
  openaiProvider,
  anthropicProvider,
  openaiCompatibleProvider,
  claudeCodeCliProvider,
  kimiCodeCliProvider,
  ollamaProvider,
  qwenProvider,
  geminiProvider,
] as const satisfies readonly ProviderDefinition[];

export type ProviderId = (typeof providers)[number]["id"];
export type ProviderCategory = (typeof providers)[number]["category"];

export const providerIds = providers.map((p) => p.id) as [
  typeof providers[number]["id"],
  typeof providers[number]["id"],
  ...typeof providers[number]["id"][],
];

export const cliProviderIds = providers
  .filter((p) => p.category === "cli")
  .map((p) => p.id) as string[];

export const apiProviderIds = providers
  .filter((p) => p.category === "api")
  .map((p) => p.id) as string[];

export function isCliProvider(provider: string): boolean {
  return cliProviderIds.includes(provider);
}
