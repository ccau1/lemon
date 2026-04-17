import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDataDir, setDataDir } from "../config/datadir.js";

const setDataDirSchema = z.object({
  dataDir: z.string(),
});

export async function serverInfoRoutes(fastify: FastifyInstance) {
  fastify.get("/server-info", async () => {
    return { dataDir: getDataDir() };
  });

  fastify.post("/server-info/datadir", async (request, reply) => {
    const body = setDataDirSchema.parse(request.body);
    setDataDir(body.dataDir);
    return { success: true, restartRequired: true };
  });
}
