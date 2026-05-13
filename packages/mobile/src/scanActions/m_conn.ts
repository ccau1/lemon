import { Alert } from "react-native";
import { ScanAction, type ScanActionContext } from "@lemon/shared";
import type { ScanActionsDeps } from "./index";
import { type Connection } from "../stores/connectionsStore";

export class MConnScanAction extends ScanAction<ScanActionsDeps> {
  constructor(deps: ScanActionsDeps) {
    super(deps);
  }

  async action(payload: Record<string, unknown>, ctx: ScanActionContext): Promise<void> {
    if (!payload.url || !payload.machineId) {
      throw new Error("Invalid connection data.");
    }

    const conn: Connection = {
      id: payload.machineId as string,
      name: (payload.machineName as string) || "Unknown Machine",
      url: String(payload.url).replace(/\/$/, ""),
      machineId: payload.machineId as string,
    };

    const client = this.deps.buildApiClient(conn);
    const result = await client.registerDevice();

    if (result.status === "removed") {
      await this.deps.saveConnection({ ...conn, status: "removed" });
      Alert.alert("Removed", "This machine has removed this connection.", [
        { text: "OK", onPress: () => ctx.goBack() },
      ]);
      return;
    }

    const status = result.status === "pending_approval" ? "pending" : "approved";
    await this.deps.saveConnection({ ...conn, status });

    if (status === "pending") {
      Alert.alert("Saved", `Saved connection to ${conn.name}. Approve this device on the machine to connect.`, [
        { text: "OK", onPress: () => ctx.goBack() },
      ]);
    } else {
      Alert.alert("Connected", `Saved connection to ${conn.name}.`, [
        { text: "OK", onPress: () => ctx.goBack() },
      ]);
    }
  }
}
