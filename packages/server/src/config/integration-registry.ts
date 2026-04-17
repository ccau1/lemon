import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import type { IntegrationConfig, IntegrationField } from "@lemon/shared";

const INTEGRATIONS_FILE = "integrations.json";

function getEncryptionKey(): Buffer {
  const envKey = process.env.LEMON_ENCRYPTION_KEY;
  if (envKey) {
    return crypto.scryptSync(envKey, "lemon-salt", 32);
  }
  const machineSeed = `${os.hostname()}-${os.homedir()}-lemon-integration-seed`;
  return crypto.createHash("sha256").update(machineSeed).digest();
}

const ENCRYPTION_KEY = getEncryptionKey();

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted text format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export class IntegrationRegistry {
  constructor(private dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private filePath(): string {
    return path.join(this.dataDir, INTEGRATIONS_FILE);
  }

  private readAll(): IntegrationConfig[] {
    const p = this.filePath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf-8")) as IntegrationConfig[];
  }

  private writeAll(integrations: IntegrationConfig[]): void {
    fs.writeFileSync(this.filePath(), JSON.stringify(integrations, null, 2), "utf-8");
  }

  list(): IntegrationConfig[] {
    return this.readAll();
  }

  get(id: string): IntegrationConfig | undefined {
    return this.readAll().find((i) => i.id === id);
  }

  add(integration: Omit<IntegrationConfig, "id" | "createdAt" | "updatedAt">): IntegrationConfig {
    const all = this.readAll();
    const item: IntegrationConfig = {
      ...integration,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    all.push(item);
    this.writeAll(all);
    return item;
  }

  update(id: string, patch: Partial<Omit<IntegrationConfig, "id" | "createdAt" | "updatedAt">>): IntegrationConfig | undefined {
    const all = this.readAll();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    this.writeAll(all);
    return all[idx];
  }

  remove(id: string): boolean {
    const all = this.readAll();
    const idx = all.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    this.writeAll(all);
    return true;
  }

  encryptSecrets(config: Record<string, unknown>, secretFieldNames: string[]): Record<string, unknown> {
    const result = { ...config };
    for (const key of secretFieldNames) {
      if (typeof result[key] === "string" && (result[key] as string).length > 0) {
        const val = result[key] as string;
        if (!val.startsWith("enc:")) {
          result[key] = `enc:${encrypt(val)}`;
        }
      }
    }
    return result;
  }

  decryptSecrets(config: Record<string, unknown>, secretFieldNames: string[]): Record<string, unknown> {
    const result = { ...config };
    for (const key of secretFieldNames) {
      if (typeof result[key] === "string") {
        const val = result[key] as string;
        if (val.startsWith("enc:")) {
          result[key] = decrypt(val.slice(4));
        }
      }
    }
    return result;
  }

  redactSecrets(config: Record<string, unknown>, secretFieldNames: string[]): Record<string, unknown> {
    const result = { ...config };
    for (const key of secretFieldNames) {
      if (typeof result[key] === "string" && (result[key] as string).length > 0) {
        result[key] = "***REDACTED***";
      }
    }
    return result;
  }
}
