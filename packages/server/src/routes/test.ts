import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const runTestSchema = z.object({
  testFile: z.string().optional(),
  ticketId: z.string().optional(),
});

export async function testRoutes(fastify: FastifyInstance) {
  fastify.post("/test/ui", async (request, reply) => {
    const body = runTestSchema.parse(request.body);
    const rootDir = process.cwd();
    const playwrightDir = path.resolve(rootDir, "packages", "playwright");
    const cliPath = path.resolve(
      playwrightDir,
      "node_modules",
      "@playwright",
      "test",
      "cli.js"
    );

    const outputFile = path.join(playwrightDir, "test-results.json");
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    const args = [cliPath, "test"];
    if (body.testFile) args.push(body.testFile);

    return new Promise((resolve, reject) => {
      const proc = spawn("node", args, {
        cwd: playwrightDir,
        env: process.env,
      });

      let stderr = "";

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        let jsonReport = null;
        try {
          if (fs.existsSync(outputFile)) {
            jsonReport = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
          }
        } catch {
          // ignore parse errors
        }

        resolve({
          success: code === 0,
          exitCode: code,
          report: jsonReport,
          stderr: stderr || undefined,
        });
      });

      proc.on("error", (err) => {
        reject(err);
      });
    });
  });
}
