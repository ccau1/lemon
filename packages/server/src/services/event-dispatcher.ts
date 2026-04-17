import type { IntegrationEventName, IntegrationEventPayload, IntegrationContext } from "@lemon/shared";
import { integrationRegistry } from "@lemon/shared";
import type { IntegrationRegistry } from "../config/integration-registry.js";

export class EventDispatcher {
  constructor(private registry: IntegrationRegistry) {}

  async dispatch(event: IntegrationEventName, payload: IntegrationEventPayload): Promise<void> {
    const integrations = this.registry.list().filter((i) => i.enabled);
    for (const integration of integrations) {
      const def = integrationRegistry[integration.type as keyof typeof integrationRegistry];
      if (!def) continue;

      const handlers = def.onEvents.filter((h) => h.event === event);
      if (handlers.length === 0) continue;

      const decryptedConfig = this.registry.decryptSecrets(
        integration.config,
        this.getSecretFieldNames(def)
      );

      const ctx: IntegrationContext = {
        workspaceId: payload.workspaceId,
        ticketId: payload.ticketId,
        step: payload.step,
        config: decryptedConfig,
        payload,
      };

      for (const handler of handlers) {
        try {
          await Promise.resolve(handler.handler(ctx));
        } catch (err) {
          console.error(`[EventDispatcher] Handler failed for ${integration.type}:${event}`, err);
        }
      }
    }
  }

  private getSecretFieldNames(def: (typeof integrationRegistry)["jira"]): string[] {
    return def.form.fields.filter((f) => f.type === "secret").map((f) => f.name);
  }
}
