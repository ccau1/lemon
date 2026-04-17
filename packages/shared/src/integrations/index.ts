import jira from "./jira/index.js";
import shortcut from "./shortcut/index.js";

export const integrationRegistry = {
  jira,
  shortcut,
};

export type IntegrationType = keyof typeof integrationRegistry;
