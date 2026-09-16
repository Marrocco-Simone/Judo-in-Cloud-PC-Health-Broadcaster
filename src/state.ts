import type { Packet, Specs, Telemetry } from "./net/protocol.ts";

export const STALE_MS = 30_000;
export const GONE_MS = 120_000;
export const DROP_MS = 3_600_000;
export const DEFAULT_HISTORY_CAP = 50_000;

export type Status = "live" | "stale" | "gone";

export interface Machine {
  key: string;
  number: string;
  hostname: string;
  from: string;
  lastSeen: number;
  /** sentAt of the last telemetry recorded: the same beat arrives once per broadcast target */
  lastRecordedSentAt: number | null;
  specs: Specs | null;
  telemetry: Telemetry | null;
}

export interface MachineView extends Machine {
  status: Status;
  sinceLastBeat: number;
  duplicate: boolean;
}

export interface HistoryEntry {
  t: number;
  number: string;
  hostname: string;
  telemetry: Telemetry;
}

export function statusFor(ageMs: number): Status {
  if (ageMs >= GONE_MS) return "gone";
  if (ageMs >= STALE_MS) return "stale";
  return "live";
}

export function machineKey(number: string, hostname: string): string {
  return `${number}|${hostname}`;
}

export class Fleet {
  private readonly machines = new Map<string, Machine>();
  private readonly entries: HistoryEntry[] = [];
  private readonly listeners: ((entry: HistoryEntry) => void)[] = [];

  constructor(private readonly historyCap = DEFAULT_HISTORY_CAP) {}

  onEntry(listener: (entry: HistoryEntry) => void): void {
    this.listeners.push(listener);
  }

  apply(packet: Packet, from: string, now = Date.now()): void {
    const key = machineKey(packet.number, packet.hostname);
    const machine = this.machines.get(key) ?? {
      key,
      number: packet.number,
      hostname: packet.hostname,
      from,
      lastSeen: now,
      lastRecordedSentAt: null,
      specs: null,
      telemetry: null,
    };
    machine.lastSeen = now;
    machine.from = from;
    if (packet.kind === "specs") {
      machine.specs = packet.specs;
    } else if (packet.sentAt !== machine.lastRecordedSentAt) {
      machine.telemetry = packet.telemetry;
      machine.lastRecordedSentAt = packet.sentAt;
      this.record({
        t: now,
        number: packet.number,
        hostname: packet.hostname,
        telemetry: packet.telemetry,
      });
    }
    this.machines.set(key, machine);
  }

  snapshot(now = Date.now()): MachineView[] {
    for (const [key, m] of this.machines) {
      if (now - m.lastSeen >= DROP_MS) this.machines.delete(key);
    }
    const hostsByNumber = new Map<string, Set<string>>();
    for (const m of this.machines.values()) {
      const hosts = hostsByNumber.get(m.number) ?? new Set<string>();
      hosts.add(m.hostname);
      hostsByNumber.set(m.number, hosts);
    }
    return [...this.machines.values()]
      .map((m) => ({
        ...m,
        status: statusFor(now - m.lastSeen),
        sinceLastBeat: Math.max(0, Math.round((now - m.lastSeen) / 1000)),
        duplicate: (hostsByNumber.get(m.number)?.size ?? 0) > 1,
      }))
      .sort(byNumber);
  }

  get history(): readonly HistoryEntry[] {
    return this.entries;
  }

  private record(entry: HistoryEntry): void {
    if (this.entries.length >= this.historyCap) {
      // limit: drops the oldest tenth of the ring in one splice; a real ring buffer is the upgrade
      this.entries.splice(0, Math.ceil(this.historyCap / 10));
    }
    this.entries.push(entry);
    for (const listener of this.listeners) listener(entry);
  }
}

function byNumber(a: MachineView, b: MachineView): number {
  const na = Number(a.number);
  const nb = Number(b.number);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.number.localeCompare(b.number) || a.hostname.localeCompare(b.hostname);
}
