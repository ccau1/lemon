import { serveCommand } from "./serve.js";
import { findRunningServerPort, getServerPortFromFile } from "../server-discovery.js";

export async function serverStartCommand(args: { port?: string; dataDir?: string }) {
  await serveCommand(args);
}

export async function serverPortCommand() {
  const filePort = getServerPortFromFile();
  if (filePort) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      const res = await fetch(`http://localhost:${filePort}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        console.log(filePort);
        return;
      }
    } catch {
      // stale port file; fall through to scan
    }
  }

  const port = await findRunningServerPort();
  if (port) {
    console.log(port);
  } else {
    console.error("No running Lemon server found.");
    process.exit(1);
  }
}
