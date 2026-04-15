const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getWorkspaces: () => fetchJson("/api/workspaces"),
  createWorkspace: (body: { name: string; path: string }) =>
    fetchJson("/api/workspaces", { method: "POST", body: JSON.stringify(body) }),

  getProjects: (workspaceId: string) =>
    fetchJson(`/api/projects?workspaceId=${encodeURIComponent(workspaceId)}`),
  createProject: (body: { workspaceId: string; name: string }) =>
    fetchJson("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  renameProject: (workspaceId: string, projectId: string, name: string) =>
    fetchJson(`/api/projects/${projectId}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),

  getTickets: (workspaceId: string, projectId?: string) => {
    const q = new URLSearchParams({ workspaceId });
    if (projectId) q.set("projectId", projectId);
    return fetchJson(`/api/tickets?${q.toString()}`);
  },
  getAllTickets: () => fetchJson("/api/tickets/all"),
  createTicket: (workspaceId: string, body: { projectId: string; title: string; description: string }) =>
    fetchJson(`/api/tickets?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getTicketDetails: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/details?workspaceId=${encodeURIComponent(workspaceId)}`),
  advanceTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/advance?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  queueTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/queue?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  runTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/run?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  saveSpec: (workspaceId: string, ticketId: string, content: string) =>
    fetchJson(`/api/tickets/${ticketId}/spec?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  savePlan: (workspaceId: string, ticketId: string, content: string) =>
    fetchJson(`/api/tickets/${ticketId}/plan?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  saveTasks: (workspaceId: string, ticketId: string, tasks: Array<{ description: string; done: boolean }>) =>
    fetchJson(`/api/tickets/${ticketId}/tasks?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({ tasks }),
    }),
  chatTicket: (workspaceId: string, ticketId: string, body: { step: string; messages: any[] }) =>
    fetchJson(`/api/tickets/${ticketId}/chat?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getModels: () => fetchJson("/api/models"),
  createModel: (body: Record<string, unknown>) =>
    fetchJson("/api/models", { method: "POST", body: JSON.stringify(body) }),
  updateModel: (id: string, body: Record<string, unknown>) =>
    fetchJson(`/api/models/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteModel: (id: string) =>
    fetchJson(`/api/models/${id}`, { method: "DELETE" }),
  reorderModels: (ids: string[]) =>
    fetchJson("/api/models/reorder", { method: "PATCH", body: JSON.stringify({ ids }) }),

  getConfig: (workspaceId?: string) => {
    const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return fetchJson(`/api/config${q}`);
  },
  getConfigRaw: (workspaceId: string) =>
    fetchJson(`/api/config/raw?workspaceId=${encodeURIComponent(workspaceId)}`),
  setConfig: (body: { key: string; value: unknown; workspaceId?: string }) =>
    fetchJson("/api/config", { method: "POST", body: JSON.stringify(body) }),
  setDefaultModel: (body: { step: string; modelId: string; workspaceId?: string }) =>
    fetchJson("/api/config/default-model", { method: "POST", body: JSON.stringify(body) }),

  getActions: (workspaceId?: string) => {
    const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return fetchJson(`/api/actions${q}`);
  },
  runAction: (body: { workspaceId: string; actionName: string; ticketId?: string; modelId?: string }) =>
    fetchJson("/api/actions/run", { method: "POST", body: JSON.stringify(body) }),
  getActionRuns: (workspaceId?: string, actionName?: string) => {
    const q = new URLSearchParams();
    if (workspaceId) q.set("workspaceId", workspaceId);
    if (actionName) q.set("actionName", actionName);
    return fetchJson(`/api/actions/runs?${q.toString()}`);
  },

  getThemes: () => fetchJson("/themes") as Promise<{ themes: Array<{ id: string; name: string; builtIn: boolean }> }>,
  setTheme: (theme: string) => fetchJson("/api/config", { method: "POST", body: JSON.stringify({ key: "theme", value: theme }) }),

  getDocs: () => fetchJson("/api/docs") as Promise<{ tree: any[]; contents: Record<string, string> }>,
};
