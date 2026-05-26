import { startServer, resolveDataDir } from "@lemon/server";

export async function serveCommand(args: { port?: string; dataDir?: string }) {
  const port = args.port
    ? Number(args.port)
    : process.env.PORT
      ? Number(process.env.PORT)
      : process.env.LEMON_PORT
        ? Number(process.env.LEMON_PORT)
        : undefined;
  const dataDir = resolveDataDir(args.dataDir || process.env.DATA_DIR);
  const resolvedPort = await startServer({ port, dataDir });
  console.log(`Server listening on port ${resolvedPort}`);
}
