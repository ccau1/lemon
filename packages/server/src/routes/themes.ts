import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { builtInThemes } from "../themes/builtins.js";

export async function themeRoutes(
  fastify: FastifyInstance,
  { dataDir }: { dataDir: string }
) {
  const customDir = path.join(dataDir, "styles");

  fastify.get("/themes", async () => {
    const builtins = Object.keys(builtInThemes).map((id) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      builtIn: true,
    }));

    const customs: Array<{ id: string; name: string; builtIn: boolean }> = [];
    if (fs.existsSync(customDir)) {
      for (const entry of fs.readdirSync(customDir)) {
        if (entry.endsWith(".css")) {
          const id = entry.slice(0, -4);
          customs.push({
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            builtIn: false,
          });
        }
      }
    }

    return { themes: [...builtins, ...customs] };
  });

  fastify.get("/themes/:name.css", async (request, reply) => {
    const { name } = request.params as { name: string };

    if (builtInThemes[name]) {
      reply.type("text/css");
      return builtInThemes[name];
    }

    const customPath = path.join(customDir, `${name}.css`);
    if (fs.existsSync(customPath)) {
      reply.type("text/css");
      return fs.readFileSync(customPath, "utf-8");
    }

    reply.status(404);
    return { error: "Theme not found" };
  });
}
