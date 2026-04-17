const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.message || err.error || `HTTP ${res.status}`;
    throw new Error(msg);
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

  getTickets: (workspaceId: string, projectId?: string, includeArchived?: boolean) => {
    const q = new URLSearchParams({ workspaceId });
    if (projectId) q.set("projectId", projectId);
    if (includeArchived) q.set("includeArchived", "true");
    return fetchJson(`/api/tickets?${q.toString()}`);
  },
  getAllTickets: (includeArchived?: boolean) => {
    const q = new URLSearchParams();
    if (includeArchived) q.set("includeArchived", "true");
    return fetchJson(`/api/tickets/all?${q.toString()}`);
  },
  createTicket: (workspaceId: string, body: { projectId: string; title: string; description: string }) =>
    fetchJson(`/api/tickets?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTicket: (workspaceId: string, ticketId: string, body: { title?: string; description?: string; autoApprove?: Partial<Record<string, boolean>> }) =>
    fetchJson(`/api/tickets/${ticketId}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getTicketDetails: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/details?workspaceId=${encodeURIComponent(workspaceId)}`),
  advanceTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/advance?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  stepBackTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/back?workspaceId=${encodeURIComponent(workspaceId)}`, {
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
  approveTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/approve?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  rejectTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/reject?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  archiveTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/archive?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  unarchiveTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}/unarchive?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  deleteTicket: (workspaceId: string, ticketId: string) =>
    fetchJson(`/api/tickets/${ticketId}?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "DELETE",
      headers: {},
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
  saveTasks: (workspaceId: string, ticketId: string, tasks: Array<{ description: string; done: boolean; comment?: string }>) =>
    fetchJson(`/api/tickets/${ticketId}/tasks?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({ tasks }),
    }),
  getTicketThread: (workspaceId: string, ticketId: string, step: string) =>
    fetchJson(`/api/tickets/${ticketId}/thread?workspaceId=${encodeURIComponent(workspaceId)}&step=${encodeURIComponent(step)}`),
  chatTicket: (workspaceId: string, ticketId: string, body: { step: string; messages: any[]; revise?: boolean }) =>
    fetchJson(`/api/tickets/${ticketId}/chat?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }) as Promise<{ content: string; model: string; thread: Array<{ role: string; content: string }> }>,
  chatTicketSection: (workspaceId: string, ticketId: string, body: { step: string; fullContent: string; sectionContent: string; messages: any[] }) =>
    fetchJson(`/api/tickets/${ticketId}/chat-section?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  chatTask: (workspaceId: string, ticketId: string, body: { taskId: string; taskDescription: string; messages: any[] }) =>
    fetchJson(`/api/tickets/${ticketId}/chat-task?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  regenerateTicket: (workspaceId: string, ticketId: string, step: string) =>
    fetchJson(`/api/tickets/${ticketId}/regenerate?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify({ step }),
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
  getConfigDefaults: () => fetchJson("/api/config/defaults") as Promise<{ prompts: Record<string, string> }>,
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

  getIntegrations: () => fetchJson("/api/integrations"),
  getIntegrationTypes: () => fetchJson("/api/integrations/types") as Promise<
    Array<{ id: string; name: string; description?: string; form: { fields: any[] }; ticketCreate: any }>
  >,
  createIntegration: (body: { type: string; name: string; enabled: boolean; config: Record<string, unknown> }) =>
    fetchJson("/api/integrations", { method: "POST", body: JSON.stringify(body) }),
  updateIntegration: (id: string, body: Partial<{ name: string; enabled: boolean; config: Record<string, unknown> }>) =>
    fetchJson(`/api/integrations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteIntegration: (id: string) => fetchJson(`/api/integrations/${id}`, { method: "DELETE" }),
  searchIntegrationTickets: (id: string, q?: string) =>
    fetchJson(`/api/integrations/${id}/search${q ? `?q=${encodeURIComponent(q)}` : ""}`) as Promise<{
      results: Array<{ id: string; title: string; description: string; url: string }>;
    }>,
};
