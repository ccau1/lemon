import fs from "fs";
import path from "path";
import { resolveDataDir } from "@lemon/server";
import { DEFAULT_SERVER_PORT } from "@lemon/shared";

export function getServerPortFromFile(): number | undefined {
  try {
    const dataDir = resolveDataDir(process.env.DATA_DIR);
    const portFile = path.join(dataDir, ".port");
    if (!fs.existsSync(portFile)) return undefined;
    const raw = fs.readFileSync(portFile, "utf-8").trim();
    const port = raw ? Number(raw) : NaN;
    if (Number.isFinite(port) && port > 0) return port;
  } catch {
    // ignore
  }
  return undefined;
}

export async function findRunningServerPort(maxAttempts = 100, timeout = 1000): Promise<number | undefined> {
  const filePort = getServerPortFromFile();
  // Try the recorded port first in case the server is above the default.
  const portsToTry = new Set<number>();
  if (filePort) portsToTry.add(filePort);
  for (let i = 0; i < maxAttempts; i++) {
    portsToTry.add(DEFAULT_SERVER_PORT + i);
  }

  for (const port of portsToTry) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return port;
    } catch {
      // continue scanning
    }
  }
  return undefined;
}
