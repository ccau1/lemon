export class ApiClient {
  constructor(private baseUrl: string) {}

  private async fetch(path: string, init?: RequestInit) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  getWorkspaces() {
    return this.fetch("/workspaces");
  }
  createWorkspace(body: { name: string; path: string }) {
    return this.fetch("/workspaces", { method: "POST", body: JSON.stringify(body) });
  }
  deleteWorkspace(id: string) {
    return this.fetch(`/workspaces/${id}`, { method: "DELETE" });
  }

  getProjects(workspaceId: string) {
    return this.fetch(`/projects?workspaceId=${encodeURIComponent(workspaceId)}`);
  }
  createProject(body: { workspaceId: string; name: string }) {
    return this.fetch("/projects", { method: "POST", body: JSON.stringify(body) });
  }

  getTickets(workspaceId: string, projectId?: string) {
    const q = new URLSearchParams({ workspaceId });
    if (projectId) q.set("projectId", projectId);
    return this.fetch(`/tickets?${q.toString()}`);
  }
  createTicket(workspaceId: string, body: { projectId: string; title: string; description?: string }) {
    return this.fetch(`/tickets?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  getTicketDetails(workspaceId: string, ticketId: string) {
    return this.fetch(
      `/tickets/${ticketId}/details?workspaceId=${encodeURIComponent(workspaceId)}`
    );
  }

  getModels() {
    return this.fetch("/models");
  }
  createModel(body: Record<string, unknown>) {
    return this.fetch("/models", { method: "POST", body: JSON.stringify(body) });
  }

  getConfig(workspaceId?: string) {
    const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return this.fetch(`/config${q}`);
  }
  setConfig(body: { key: string; value: unknown; workspaceId?: string }) {
    return this.fetch("/config", { method: "POST", body: JSON.stringify(body) });
  }
  setDefaultModel(body: {
    step: string;
    modelId: string;
    workspaceId?: string;
  }) {
    return this.fetch("/config/default-model", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  chatTicket(
    workspaceId: string,
    ticketId: string,
    body: { step: string; messages: Array<{ role: string; content: string }> }
  ) {
    return this.fetch(
      `/tickets/${ticketId}/chat?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify(body) }
    ) as Promise<{ content: string; model: string }>;
  }

  saveSpec(workspaceId: string, ticketId: string, content: string) {
    return this.fetch(
      `/tickets/${ticketId}/spec?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({ content }) }
    );
  }

  savePlan(workspaceId: string, ticketId: string, content: string) {
    return this.fetch(
      `/tickets/${ticketId}/plan?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({ content }) }
    );
  }

  saveTasks(
    workspaceId: string,
    ticketId: string,
    tasks: Array<{ description: string; done: boolean }>
  ) {
    return this.fetch(
      `/tickets/${ticketId}/tasks?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({ tasks }) }
    );
  }

  saveImplementation(workspaceId: string, ticketId: string, content: string) {
    return this.fetch(
      `/tickets/${ticketId}/implement?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({ content }) }
    );
  }

  advanceTicket(workspaceId: string, ticketId: string) {
    return this.fetch(
      `/tickets/${ticketId}/advance?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({}) }
    ) as Promise<{ success: boolean; newStatus: string }>;
  }

  stepBackTicket(workspaceId: string, ticketId: string) {
    return this.fetch(
      `/tickets/${ticketId}/back?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({}) }
    ) as Promise<{ success: boolean; newStatus: string }>;
  }

  queueTicket(workspaceId: string, ticketId: string) {
    return this.fetch(
      `/tickets/${ticketId}/queue?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({}) }
    );
  }

  resetTicket(workspaceId: string, ticketId: string) {
    return this.fetch(
      `/tickets/${ticketId}/reset?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({}) }
    );
  }

  runTicket(workspaceId: string, ticketId: string) {
    return this.fetch(
      `/tickets/${ticketId}/run?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST", body: JSON.stringify({}) }
    );
  }

  runQueued(workspaceId: string, allWorkspaces = false) {
    return this.fetch("/tickets/run", {
      method: "POST",
      body: JSON.stringify({ workspaceId, parallel: true, allWorkspaces }),
    });
  }
}
