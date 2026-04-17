import { startServer, resolveDataDir } from "@lemon/server";

export function serveCommand(args: { port?: string; dataDir?: string }) {
  const port = Number(args.port || process.env.PORT || 3000);
  const dataDir = resolveDataDir(args.dataDir || process.env.DATA_DIR);
  startServer({ port, dataDir });
}
