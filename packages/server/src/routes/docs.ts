import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fg from "fast-glob";

type DocNode =
  | { type: "folder"; name: string; path: string; children: DocNode[] }
  | { type: "file"; name: string; path: string };

type DocsData = {
  tree: DocNode[];
  contents: Record<string, string>;
};

function formatName(name: string): string {
  return name
    .replace(/-/g, " ")
    .replace(/\.md$/i, "")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isSkipped(content: string): boolean {
  const prefix = content.slice(0, 200);
  return /^\s*<!--\s*skip-doc\s*-->/i.test(prefix);
}

function buildTree(files: { relPath: string; content: string }[]): DocsData {
  const tree: DocNode[] = [];
  const contents: Record<string, string> = {};

  for (const { relPath, content } of files) {
    const pathKey = relPath.replace(/\.md$/i, "");
    contents[pathKey] = content;

    const parts = pathKey.split("/");
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const existingIndex = current.findIndex((n) => n.name === formatName(part));
      if (isLast) {
        if (existingIndex >= 0 && current[existingIndex].type === "folder") {
          current[existingIndex].children.push({
            type: "file",
            name: formatName(part),
            path: pathKey,
          });
        } else {
          current.push({
            type: "file",
            name: formatName(part),
            path: pathKey,
          });
        }
      } else {
        if (existingIndex >= 0) {
          const existing = current[existingIndex];
          if (existing.type === "folder") {
            current = existing.children;
          } else {
            const folder: DocNode = {
              type: "folder",
              name: formatName(part),
              path: parts.slice(0, i + 1).join("/"),
              children: [existing],
            };
            current[existingIndex] = folder;
            current = folder.children;
          }
        } else {
          const folder: DocNode = {
            type: "folder",
            name: formatName(part),
            path: parts.slice(0, i + 1).join("/"),
            children: [],
          };
          current.push(folder);
          current = folder.children;
        }
      }
    }
  }

  function sortNodes(nodes: DocNode[]) {
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "folder" ? -1 : 1;
    });
    for (const node of nodes) {
      if (node.type === "folder") sortNodes(node.children);
    }
  }
  sortNodes(tree);

  return { tree, contents };
}

export async function docsRoutes(fastify: FastifyInstance) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const docsDir = path.resolve(__dirname, "../../../..", "docs");

  fastify.get("/docs", async () => {
    if (!fs.existsSync(docsDir)) {
      return { tree: [], contents: {} };
    }

    const entries = await fg("**/*.md", {
      cwd: docsDir,
      onlyFiles: true,
      absolute: false,
    });

    const files: { relPath: string; content: string }[] = [];
    for (const entry of entries) {
      const fullPath = path.join(docsDir, entry);
      const content = fs.readFileSync(fullPath, "utf-8");
      if (isSkipped(content)) continue;
      files.push({ relPath: entry, content });
    }

    return buildTree(files);
  });
}
