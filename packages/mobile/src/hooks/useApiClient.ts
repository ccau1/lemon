import { useCallback } from "react";
import * as Device from "expo-device";
import { getOrCreateDeviceId } from "../stores/connectionsStore";
import type { Connection } from "../stores/connectionsStore";

async function fetchJson(baseUrl: string, path: string, init?: RequestInit & { timeout?: number }) {
  const deviceId = await getOrCreateDeviceId();
  const timeout = init?.timeout ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        "x-device-id": deviceId,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: controller.signal,
      ...init,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const msg = err.message || err.error || err.status || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return res.json();
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      throw new Error("Request timed out. The server may be unreachable or the ticket is stuck.");
    }
    throw e;
  }
}

export function buildApiClient(connection: Connection) {
  const baseUrl = connection.url.replace(/\/$/, "");

  return {
    healthCheck: () => fetchJson(baseUrl, "/health") as Promise<{ status: string }>,

    getWorkspaces: () => fetchJson(baseUrl, "/workspaces"),
    createWorkspace: (body: { name: string; path: string }) =>
      fetchJson(baseUrl, "/workspaces", { method: "POST", body: JSON.stringify(body) }),
    deleteWorkspace: (id: string) =>
      fetchJson(baseUrl, `/workspaces/${id}`, { method: "DELETE" }),
    getProjects: (workspaceId: string) =>
      fetchJson(baseUrl, `/projects?workspaceId=${encodeURIComponent(workspaceId)}`),

    getTickets: (workspaceId: string, projectId?: string) => {
      const q = new URLSearchParams({ workspaceId });
      if (projectId) q.set("projectId", projectId);
      return fetchJson(baseUrl, `/tickets?${q.toString()}`);
    },
    getAllTickets: () => fetchJson(baseUrl, "/tickets/all"),

    createTicket: (workspaceId: string, body: { projectId: string; title: string; description: string }) =>
      fetchJson(baseUrl, `/tickets?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    getTicketDetails: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/details?workspaceId=${encodeURIComponent(workspaceId)}`),

    advanceTicket: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/advance?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    queueTicket: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/queue?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    approveTicket: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/approve?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    rejectTicket: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/reject?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    startImplementation: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/start-implement?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    stopImplementation: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/stop-implement?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    startTaskEarly: (workspaceId: string, ticketId: string, taskId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/tasks/${taskId}/start-early?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    chatTicket: (workspaceId: string, ticketId: string, body: { step: string; messages: any[]; revise?: boolean }) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/chat?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify(body),
      }) as Promise<{ content: string; model: string; thread: Array<{ role: string; content: string }> }>,

    updateTicket: (workspaceId: string, ticketId: string, body: { autoApprove?: Partial<Record<string, boolean>> }) =>
      fetchJson(baseUrl, `/tickets/${ticketId}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    regenerateTicket: (workspaceId: string, ticketId: string, step: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/regenerate?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({ step }),
      }),

    cancelTicketRun: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/cancel?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }),

    recoverTicket: (workspaceId: string, ticketId: string) =>
      fetchJson(baseUrl, `/tickets/${ticketId}/recover?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({}),
      }) as Promise<{ recovered: boolean; message: string }>,

    getDeviceStatus: async (): Promise<{ status: string; id: string; name: string }> => {
      return fetchJson(baseUrl, "/connection/devices/me") as Promise<{ status: string; id: string; name: string }>;
    },

    registerDevice: async (): Promise<{ status: string; device?: any }> => {
      const deviceId = await getOrCreateDeviceId();
      const make = Device.brand || undefined;
      const model = Device.modelName || undefined;
      const phoneName = Device.deviceName || undefined;
      const deviceName = phoneName || [make, model].filter(Boolean).join(" ") || "Lemon Mobile";
      return fetchJson(baseUrl, "/connection/register", {
        method: "POST",
        body: JSON.stringify({ deviceId, deviceName, make, model }),
      });
    },

    reconnectDevice: async (): Promise<{ status: string; device?: any }> => {
      const deviceId = await getOrCreateDeviceId();
      const make = Device.brand || undefined;
      const model = Device.modelName || undefined;
      const phoneName = Device.deviceName || undefined;
      const deviceName = phoneName || [make, model].filter(Boolean).join(" ") || "Lemon Mobile";
      return fetchJson(baseUrl, `/connection/devices/${encodeURIComponent(deviceId)}/reconnect`, {
        method: "POST",
        body: JSON.stringify({ deviceId, deviceName, make, model }),
      });
    },
  };
}

export function useApiClient() {
  const buildClient = useCallback(buildApiClient, []);
  return { buildClient };
}
