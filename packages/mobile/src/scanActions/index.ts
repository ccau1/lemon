import { MConnScanAction } from "./m_conn";
import { ScanAction } from "@lemon/shared";
import type { Connection } from "../stores/connectionsStore";

export type { ScanActionContext } from "@lemon/shared";

export interface ScanActionsDeps {
  saveConnection: (conn: Connection) => Promise<void>;
  buildApiClient: (conn: Connection) => {
    registerDevice: () => Promise<{ status: string; device?: any }>;
  };
}

export class ScanActions {
  private actions: Record<string, ScanAction>;

  constructor(deps: ScanActionsDeps) {
    this.actions = {
      m_conn: new MConnScanAction(deps),
    };
  }

  get(type: string): ScanAction | undefined {
    return this.actions[type];
  }
}
