import fs from "fs";
import path from "path";

export function syncTicketArtifact(
  workspacePath: string,
  ticketId: string,
  step: "spec" | "plan" | "tasks" | "implement",
  content: string | Array<{ description: string; done: boolean }>
): void {
  const dir = path.join(workspacePath, ".lemon", "tickets", ticketId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${step}.md`);
  if (step === "tasks") {
    const tasks = content as Array<{ description: string; done: boolean }>;
    const markdown = tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.description}`).join("\n");
    fs.writeFileSync(filePath, markdown, "utf-8");
  } else {
    fs.writeFileSync(filePath, content as string, "utf-8");
  }
}
