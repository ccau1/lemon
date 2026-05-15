import type { CliHandler, CliHandlerConfig } from "../index.js";

function extractSessionId(output: string): string | undefined {
  const match = output.match(/kimi -r ([a-f0-9-]+)/);
  return match ? match[1] : undefined;
}

export const kimiCodeCliHandler: CliHandler = {
  getCommand(config: CliHandlerConfig): [string, string[]] {
    // --quiet: non-interactive mode that prints only the final assistant text
    //          (equivalent to --print --output-format text --final-message-only)
    // --yolo: explicit auto-approval (safeguards against config overriding the CLI flag)
    // --prompt: pass prompt text explicitly so it never gets parsed as a flag
    return [config.modelId, ["--quiet", "--yolo", "--prompt"]];
  },

  async enrichError(stderr: string, stdout: string): Promise<string> {
    const sessionId = extractSessionId(stderr + stdout);
    if (!sessionId) return stderr || stdout;

    try {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");

      const logFile = path.join(os.homedir(), ".kimi", "logs", "kimi.log");
      if (!fs.existsSync(logFile)) return stderr || stdout;

      const logContent = fs.readFileSync(logFile, "utf-8");
      const lines = logContent.split("\n");
      const relevant = lines
        .filter(
          (l) =>
            l.includes(sessionId) &&
            (/\bERROR\b/.test(l) || /\bWARNING\b/.test(l) || l.includes("failed"))
        )
        .map((l) => {
          const m = l.match(new RegExp(`${sessionId} - (.+)`));
          return m ? m[1].trim() : l.trim();
        })
        .filter(Boolean);

      const unique = [...new Set(relevant)];
      if (unique.length === 0) return stderr || stdout;
      return `${stderr || stdout}\n\nDetails from kimi logs:\n${unique.join("\n")}`;
    } catch {
      return stderr || stdout;
    }
  },
};
