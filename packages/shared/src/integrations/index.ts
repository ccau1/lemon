import jira from "./jira/index.js";
import shortcut from "./shortcut/index.js";
import trello from "./trello/index.js";
import linear from "./linear/index.js";

export const integrationRegistry = {
  jira,
  shortcut,
  trello,
  linear,
};

export type IntegrationType = keyof typeof integrationRegistry;
