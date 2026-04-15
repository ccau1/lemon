import { startServer } from "@lemon/server";
import path from "path";
import os from "os";

export function serveCommand(args: { port?: string; dataDir?: string }) {
  const port = Number(args.port || process.env.PORT || 3000);
  const dataDir = args.dataDir || process.env.DATA_DIR || path.join(os.homedir(), ".lemon");
  startServer({ port, dataDir });
}
