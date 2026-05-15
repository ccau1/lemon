import type { CliHandler } from "./index.js";
import { isCliProvider } from "./index.js";

export async function getCliHandler(
  provider: string
): Promise<CliHandler | undefined> {
  if (!isCliProvider(provider)) return undefined;
  try {
    const mod = (await import(
      /* @vite-ignore */
      `./${provider}/handler.js`
    )) as Record<string, unknown>;
    return Object.values(mod).find(
      (v): v is CliHandler =>
        typeof v === "object" &&
        v !== null &&
        "getCommand" in v &&
        typeof (v as CliHandler).getCommand === "function"
    );
  } catch {
    return undefined;
  }
}
