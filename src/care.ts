import { readText } from "./collectors/common.ts";
import { configDir, joinPath } from "./identity.ts";
import { type CareStatus, parseCare } from "./net/protocol.ts";

/** userData folder of the CARE System Electron app, named after its package.json */
const CARE_APP_DIR = "judo-in-cloud-care-system";
export const CARE_STATUS_FILE = "care-status.json";

export function careStatusPath(): string | null {
  const home = Deno.env.get("HOME");
  const dir = Deno.build.os === "darwin"
    ? home ? `${home}/Library/Application Support/${CARE_APP_DIR}` : null
    : configDir(CARE_APP_DIR);
  return dir === null ? null : joinPath(dir, CARE_STATUS_FILE);
}

/** null when the care system never ran in the Electron app on this PC */
export async function readCareStatus(now = Date.now()): Promise<CareStatus | null> {
  const path = careStatusPath();
  if (path === null) return null;
  try {
    const [text, info] = await Promise.all([readText(path), Deno.stat(path)]);
    if (text === null || info.mtime === null) return null;
    return careFromFile(JSON.parse(text), info.mtime.getTime(), now);
  } catch {
    return null;
  }
}

export function careFromFile(raw: unknown, writtenAt: number, now: number): CareStatus | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const lastChunkAt = "lastChunkAt" in raw ? raw.lastChunkAt : null;
  return parseCare({
    ...raw,
    age: secondsSince(writtenAt, now),
    chunkAge: typeof lastChunkAt === "number" && lastChunkAt > 0
      ? secondsSince(lastChunkAt, now)
      : null,
  });
}

function secondsSince(t: number, now: number): number {
  return Math.max(0, Math.round((now - t) / 1000));
}
