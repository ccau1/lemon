import type { FastifyInstance } from "fastify";
import { z } from "zod";
import QRCode from "qrcode";
import os from "os";
import type { DeviceRegistry } from "../config/device-registry.js";
import type { ConfigManager } from "../config/settings.js";
import { upnpNat, type Gateway } from "@achingbrain/nat-port-mapper";

export async function connectionRoutes(
  fastify: FastifyInstance,
  { registry, port, configManager, broadcast }: { registry: DeviceRegistry; port: number; configManager: ConfigManager; broadcast: (event: string, payload: unknown) => void }
) {
  const meta = registry.getMeta();

  let cachedPublicIp: string | null = null;
  let upnpUrl: string | null = null;
  let upnpGateway: Gateway | null = null;

  const getLanIp = (): string => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
    return "127.0.0.1";
  };

  const detectPublicIp = async (): Promise<string | null> => {
    if (cachedPublicIp) return cachedPublicIp;
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      cachedPublicIp = data.ip as string;
      return cachedPublicIp;
    } catch {
      return null;
    }
  };

  const detectUpnp = async (): Promise<string | null> => {
    if (upnpUrl) return upnpUrl;
    try {
      const client = upnpNat();
      for await (const gateway of client.findGateways({ signal: AbortSignal.timeout(5000) })) {
        const mapping = await gateway.map(port, getLanIp(), { protocol: "tcp" });
        const externalIp = await gateway.externalIp();
        upnpUrl = `http://${externalIp}:${mapping.externalPort}`;
        upnpGateway = gateway;
        return upnpUrl;
      }
    } catch {
      return null;
    }
    return null;
  };

  fastify.addHook("onClose", async () => {
    if (upnpGateway) {
      try {
        await upnpGateway.stop();
      } catch {
        // ignore cleanup errors
      }
    }
  });

  const buildLocalUrl = (): { url: string; source: "lan" } => {
    const nets = os.networkInterfaces();
    let candidate = "127.0.0.1";
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          candidate = net.address;
          break;
        }
      }
      if (candidate !== "127.0.0.1") break;
    }
    return { url: `http://${candidate}:${port}`, source: "lan" };
  };

  // Build external URL. Prefer config, then env, then UPnP, then public IP, then LAN IP.
  const buildUrl = async (): Promise<{ url: string; source: "manual" | "upnp" | "public" | "lan" }> => {
    try {
      const configUrl = configManager.readGlobal().externalUrl;
      if (configUrl) return { url: configUrl, source: "manual" };
    } catch {
      // corrupted or unreadable config — fall through
    }

    const envUrl = process.env.LEMON_EXTERNAL_URL;
    if (envUrl) return { url: envUrl, source: "manual" };

    const upnp = await detectUpnp();
    if (upnp) return { url: upnp, source: "upnp" };

    const publicIp = await detectPublicIp();
    if (publicIp) return { url: `http://${publicIp}:${port}`, source: "public" };

    return buildLocalUrl();
  };

  fastify.get("/connection/qr", async (request, reply) => {
    const { mode } = request.query as { mode?: string };

    const { url, source } = mode === "local"
      ? buildLocalUrl()
      : await buildUrl();

    if (mode === "external" && source === "lan") {
      return reply.status(503).send({ error: "Could not determine an external URL. Set LEMON_EXTERNAL_URL or configure an external URL in settings." });
    }

    const payload = `lm:m_conn:${JSON.stringify({
      url,
      machineId: meta.machineId,
      machineName: meta.machineName,
    })}`;
    const base64Png = await QRCode.toDataURL(payload, { type: "image/png", width: 256 });
    return reply.send({ base64Png, url, source, machineId: meta.machineId, machineName: meta.machineName });
  });

  fastify.get("/connection/devices", async () => {
    return registry.list();
  });

  fastify.post("/connection/devices/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const updated = registry.updateStatus(id, "approved");
    if (!updated) return reply.status(404).send({ error: "Device not found" });
    broadcast("device:updated", { deviceId: id, status: "approved" });
    return updated;
  });

  fastify.post("/connection/devices/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = registry.remove(id);
    if (!ok) return reply.status(404).send({ error: "Device not found" });
    broadcast("device:updated", { deviceId: id, status: "removed" });
    return { success: true };
  });

  fastify.post("/connection/devices/:id/remove", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = registry.remove(id);
    if (!ok) return reply.status(404).send({ error: "Device not found" });
    broadcast("device:updated", { deviceId: id, status: "removed" });
    return { success: true };
  });

  fastify.patch("/connection/devices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1),
    }).parse(request.body);
    const updated = registry.updateName(id, body.name);
    if (!updated) return reply.status(404).send({ error: "Device not found" });
    broadcast("device:updated", { deviceId: id, name: body.name });
    return updated;
  });

  fastify.post("/connection/devices/:id/reconnect", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> || {};
    const existing = registry.get(id);
    if (!existing) {
      const device = registry.upsert(id, body.deviceName as string || "Mobile Device", body.make as string, body.model as string, body.macAddress as string);
      broadcast("device:updated", { deviceId: id, status: "pending" });
      return reply.status(202).send({ status: "pending_approval", device });
    }

    if (existing.status === "removed") {
      const updated = registry.updateStatus(id, "pending");
      if (!updated) return reply.status(404).send({ error: "Device not found" });
      broadcast("device:updated", { deviceId: id, status: "pending" });
      return reply.status(202).send({ status: "pending_approval", device: updated });
    }

    if (existing.status === "pending") {
      return reply.status(202).send({ status: "pending_approval", device: existing });
    }

    return { status: "approved", device: existing };
  });

  fastify.get("/connection/devices/me", async (request, reply) => {
    const deviceId = (request.headers["x-device-id"] as string) || "";
    if (!deviceId) return reply.status(400).send({ error: "Missing device ID" });
    const device = registry.get(deviceId);
    if (!device) return reply.status(404).send({ error: "Device not found" });
    return device;
  });

  // Register-or-check endpoint for mobile clients
  fastify.post("/connection/register", async (request, reply) => {
    const body = z.object({
      deviceId: z.string(),
      deviceName: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      macAddress: z.string().optional(),
    }).parse(request.body);

    const existing = registry.get(body.deviceId);
    if (!existing) {
      const device = registry.upsert(body.deviceId, body.deviceName || "Mobile Device", body.make, body.model, body.macAddress);
      return reply.status(202).send({ status: "pending_approval", device });
    }

    if (existing.status === "removed") {
      return { status: "removed" };
    }

    if (existing.status === "pending") {
      return reply.status(202).send({ status: "pending_approval", device: existing });
    }

    return { status: "approved", device: existing };
  });
}
