import fs from "fs";
import path from "path";
import os from "os";

const BOOTSTRAP_DIR = path.join(os.homedir(), ".lemon");
const BOOTSTRAP_FILE = path.join(BOOTSTRAP_DIR, ".datadir");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isDefaultDir(dir: string): boolean {
  return path.resolve(dir) === BOOTSTRAP_DIR;
}

export function resolveDataDir(override?: string): string {
  const candidate = override
    ? path.resolve(override)
    : (() => {
        if (fs.existsSync(BOOTSTRAP_FILE)) {
          const raw = fs.readFileSync(BOOTSTRAP_FILE, "utf-8").trim();
          if (raw) return path.resolve(raw);
        }
        return BOOTSTRAP_DIR;
      })();

  if (fs.existsSync(candidate)) {
    return candidate;
  }
  try {
    ensureDir(candidate);
    return candidate;
  } catch {
    ensureDir(BOOTSTRAP_DIR);
    return BOOTSTRAP_DIR;
  }
}

export function setDataDir(dataDir: string): void {
  if (!dataDir || isDefaultDir(dataDir)) {
    if (fs.existsSync(BOOTSTRAP_FILE)) {
      fs.unlinkSync(BOOTSTRAP_FILE);
    }
    return;
  }
  if (!fs.existsSync(BOOTSTRAP_DIR)) {
    fs.mkdirSync(BOOTSTRAP_DIR, { recursive: true });
  }
  fs.writeFileSync(BOOTSTRAP_FILE, path.resolve(dataDir), "utf-8");
}

export function getDataDir(): string {
  return resolveDataDir();
}
