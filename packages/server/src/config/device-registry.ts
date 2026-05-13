import fs from "fs";
import path from "path";
import os from "os";

export type DeviceStatus = "pending" | "approved" | "removed";

export interface Device {
  id: string;
  name: string;
  status: DeviceStatus;
  createdAt: string;
  make?: string;
  model?: string;
  macAddress?: string;
}

export interface ServerMeta {
  machineId: string;
  machineName: string;
}

const DEVICES_FILE = "devices.json";
const SERVER_META_FILE = "server-meta.json";

export class DeviceRegistry {
  constructor(private dataDir: string) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private devicesPath(): string {
    return path.join(this.dataDir, DEVICES_FILE);
  }

  private metaPath(): string {
    return path.join(this.dataDir, SERVER_META_FILE);
  }

  private readDevices(): Device[] {
    const p = this.devicesPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Device[];
  }

  private writeDevices(devices: Device[]): void {
    fs.writeFileSync(this.devicesPath(), JSON.stringify(devices, null, 2), "utf-8");
  }

  getMeta(): ServerMeta {
    const p = this.metaPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as ServerMeta;
    }
    const meta: ServerMeta = {
      machineId: crypto.randomUUID(),
      machineName: os.hostname() || "lemon-server",
    };
    fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf-8");
    return meta;
  }

  list(): Device[] {
    return this.readDevices().filter((d) => d.status !== "removed");
  }

  get(id: string): Device | undefined {
    return this.readDevices().find((d) => d.id === id);
  }

  upsert(deviceId: string, name: string, make?: string, model?: string, macAddress?: string): Device {
    const all = this.readDevices();
    const existing = all.find((d) => d.id === deviceId);
    if (existing) {
      return existing;
    }
    const device: Device = {
      id: deviceId,
      name: name || "Unknown Device",
      status: "pending",
      createdAt: new Date().toISOString(),
      make,
      model,
      macAddress,
    };
    all.push(device);
    this.writeDevices(all);
    return device;
  }

  updateStatus(id: string, status: DeviceStatus): Device | undefined {
    const all = this.readDevices();
    const idx = all.findIndex((d) => d.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], status };
    this.writeDevices(all);
    return all[idx];
  }

  updateName(id: string, name: string): Device | undefined {
    const all = this.readDevices();
    const idx = all.findIndex((d) => d.id === id);
    if (idx === -1) return undefined;
    all[idx] = { ...all[idx], name };
    this.writeDevices(all);
    return all[idx];
  }

  remove(id: string): boolean {
    const all = this.readDevices();
    const filtered = all.filter((d) => d.id !== id);
    if (filtered.length === all.length) return false;
    this.writeDevices(filtered);
    return true;
  }

  isApproved(id: string): boolean {
    const d = this.get(id);
    return d?.status === "approved";
  }


}
