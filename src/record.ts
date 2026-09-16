import { dataDirs, joinPath } from "./identity.ts";
import type { HistoryEntry } from "./state.ts";

export const FLUSH_MS = 30_000;

export interface RoleEntry {
  role: string;
  tatami: string;
}

export const CSV_HEADER = [
  "time",
  "number",
  "hostname",
  "role",
  "tatami",
  "cpuPct",
  "ramPct",
  "batteryPct",
  "power",
  "wifiPct",
  "wifiDbm",
  "netRxBps",
  "netTxBps",
  "diskReadBps",
  "diskWriteBps",
  "tempC",
  "topProcess",
  "topProcessCpuPct",
].join(",");

export function defaultRecordName(now = new Date()): string {
  return `pc-health_${now.toISOString().slice(0, 10)}.csv`;
}

export function csvLine(entry: HistoryEntry, role: RoleEntry): string {
  const t = entry.telemetry;
  const top = t.topProcs?.[0] ?? null;
  return [
    new Date(entry.t).toISOString(),
    entry.number,
    entry.hostname,
    role.role,
    role.tatami,
    t.cpuPct,
    t.ramPct,
    t.batteryPct,
    t.power,
    t.wifiPct,
    t.wifiDbm,
    t.netRxBps,
    t.netTxBps,
    t.diskReadBps,
    t.diskWriteBps,
    t.tempC,
    top?.name ?? null,
    top?.cpuPct ?? null,
  ].map(cell).join(",");
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * Appends every received beat to one CSV file, in batches, so the history survives the process
 * and the page. Meant for the control machine only: it is the one disk write of the app.
 */
export class Recorder {
  roles: Record<string, RoleEntry> = {};
  private pending: string[] = [];
  private candidates: string[];
  private resolved: string | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(pathOrEmpty: string) {
    this.candidates = pathOrEmpty !== ""
      ? [pathOrEmpty]
      : dataDirs().map((dir) => joinPath(dir, defaultRecordName()));
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  get path(): string {
    return this.resolved ?? this.candidates[0] ?? "";
  }

  add(entry: HistoryEntry): void {
    this.pending.push(csvLine(entry, this.roles[entry.number] ?? { role: "", tatami: "" }));
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const lines = this.pending;
    this.pending = [];
    for (const path of this.resolved !== null ? [this.resolved] : this.candidates) {
      try {
        const exists = await fileHasContent(path);
        const text = (exists ? "" : CSV_HEADER + "\n") + lines.join("\n") + "\n";
        await Deno.writeTextFile(path, text, { append: true, create: true });
        this.resolved = path;
        return;
      } catch {
        continue;
      }
    }
    this.pending = lines.concat(this.pending);
    console.error(`registrazione: impossibile scrivere ${this.candidates.join(" o ")}`);
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }
}

async function fileHasContent(path: string): Promise<boolean> {
  try {
    return (await Deno.stat(path)).size > 0;
  } catch {
    return false;
  }
}
