import fs from "fs";
import path from "path";
import fg from "fast-glob";

export interface ContextScannerOptions {
  workspacePath: string;
  globs: string[];
  maxCharsPerFile?: number;
  maxTotalChars?: number;
}

export async function scanWorkspaceContext(
  options: ContextScannerOptions
): Promise<string> {
  const { workspacePath, globs, maxCharsPerFile = 8000, maxTotalChars = 32000 } = options;

  if (!fs.existsSync(workspacePath)) {
    return "";
  }

  const entries = await fg(globs, {
    cwd: workspacePath,
    dot: false,
    onlyFiles: true,
    absolute: false,
  });

  // Deduplicate and sort for stability
  const files = Array.from(new Set(entries)).sort();

  let totalChars = 0;
  const parts: string[] = [];

  for (const file of files) {
    const fullPath = path.join(workspacePath, file);
    if (!fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    try {
      let content = fs.readFileSync(fullPath, "utf-8");
      if (content.length > maxCharsPerFile) {
        content = content.slice(0, maxCharsPerFile) + "\n... [truncated]";
      }

      const chunk = `--- ${file} ---\n${content}\n`;
      if (totalChars + chunk.length > maxTotalChars) {
        parts.push("... [context truncated due to length]");
        break;
      }

      parts.push(chunk);
      totalChars += chunk.length;
    } catch {
      // skip unreadable files
    }
  }

  if (parts.length === 0) {
    return "";
  }

  return `\n\nWorkspace Context:\n${parts.join("\n")}`;
}
