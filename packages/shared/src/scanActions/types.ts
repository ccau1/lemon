export interface QrPayload {
  prefix: string;
  type: string;
  data: Record<string, unknown>;
}

export interface ScanActionContext {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
}

export abstract class ScanAction<TDeps = unknown> {
  constructor(protected readonly deps: TDeps) {}

  abstract action(payload: Record<string, unknown>, ctx: ScanActionContext): Promise<void>;
}

export function parseQrPayload(raw: string): QrPayload {
  const prefixEnd = raw.indexOf(":");
  if (prefixEnd === -1) throw new Error("Invalid QR code format.");
  const prefix = raw.slice(0, prefixEnd);

  const typeEnd = raw.indexOf(":", prefixEnd + 1);
  if (typeEnd === -1) throw new Error("Invalid QR code format.");
  const type = raw.slice(prefixEnd + 1, typeEnd);

  const json = raw.slice(typeEnd + 1);
  const data = JSON.parse(json) as Record<string, unknown>;

  return { prefix, type, data };
}
