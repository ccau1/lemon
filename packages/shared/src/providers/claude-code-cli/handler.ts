import type { CliHandler, CliHandlerConfig } from "../index.js";

export const claudeCodeCliHandler: CliHandler = {
  getCommand(config: CliHandlerConfig): [string, string[]] {
    // --dangerously-skip-permissions: auto-approve all file/shell operations
    // -p: non-interactive print mode (prompt passed as the following arg)
    return [config.modelId, ["--dangerously-skip-permissions", "-p"]];
  },
};
