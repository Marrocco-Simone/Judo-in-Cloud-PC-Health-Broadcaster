import type { Specs, Telemetry, TopProcess } from "../net/protocol.ts";
import { MAX_TOP_PROCESSES } from "../net/protocol.ts";

export interface Collector {
  specs(): Promise<Specs>;
  telemetry(beat: number): Promise<Telemetry>;
}

const decoder = new TextDecoder();

export async function run(cmd: string, args: string[], timeoutMs = 8_000): Promise<string | null> {
  try {
    const child = new Deno.Command(cmd, { args, stdin: "null", stdout: "piped", stderr: "null" })
      .spawn();
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // already exited
      }
    }, timeoutMs);
    const out = await child.output();
    clearTimeout(timer);
    return out.success ? decoder.decode(out.stdout) : null;
  } catch {
    return null;
  }
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

export async function attempt<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export class RateMeter {
  private last: { value: number; at: number } | null = null;

  sample(value: number, at: number): number | null {
    const prev = this.last;
    this.last = { value, at };
    if (prev === null || at <= prev.at || value < prev.value) return null;
    return Math.round(((value - prev.value) * 1000) / (at - prev.at));
  }
}

export class CpuMeter {
  private last: { busy: number; total: number } | null = null;

  sample(busy: number, total: number): number | null {
    const prev = this.last;
    this.last = { busy, total };
    if (prev === null || total <= prev.total) return null;
    return round1((100 * (busy - prev.busy)) / (total - prev.total));
  }
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function clampPct(n: number): number {
  return Math.max(0, Math.min(100, round1(n)));
}

export function memory(): { ramPct: number; ramUsedBytes: number } | null {
  try {
    const info = Deno.systemMemoryInfo();
    const total = info.total;
    const available = info.available;
    const used = total - available;
    return { ramPct: clampPct((100 * used) / total), ramUsedBytes: used };
  } catch {
    return null;
  }
}

export function baseSpecs(): Specs {
  let ramBytes: number | null = null;
  try {
    ramBytes = Deno.systemMemoryInfo().total;
  } catch {
    ramBytes = null;
  }
  return {
    model: null,
    cpu: null,
    cores: navigator.hardwareConcurrency,
    ramBytes,
    storageType: null,
    storageBytes: null,
    os: null,
    osVersion: null,
    kernel: safeOsRelease(),
    arch: Deno.build.arch,
  };
}

function safeOsRelease(): string | null {
  try {
    return Deno.osRelease();
  } catch {
    return null;
  }
}

export function emptyTelemetry(): Telemetry {
  return {
    cpuPct: null,
    perCore: null,
    ramPct: null,
    ramUsedBytes: null,
    batteryPct: null,
    power: null,
    wifiPct: null,
    wifiDbm: null,
    netRxBps: null,
    netTxBps: null,
    diskReadBps: null,
    diskWriteBps: null,
    tempC: null,
    topProcs: null,
  };
}

export function parsePsOutput(text: string): TopProcess[] {
  const out: TopProcess[] = [];
  for (const line of text.split("\n").slice(1)) {
    const match = line.trim().match(/^([\d.,]+)\s+(.+)$/);
    if (match === null) continue;
    const cpuPct = Number(match[1]?.replace(",", "."));
    const name = (match[2] ?? "").split("/").pop() ?? "";
    if (!Number.isFinite(cpuPct) || name === "") continue;
    out.push({ name: name.slice(0, 32), cpuPct });
    if (out.length === MAX_TOP_PROCESSES) break;
  }
  return out;
}

export function dbmToPct(dbm: number): number {
  return clampPct(2 * (dbm + 100));
}

export function firstMatch(text: string, pattern: RegExp): string | null {
  return text.match(pattern)?.[1]?.trim() ?? null;
}
