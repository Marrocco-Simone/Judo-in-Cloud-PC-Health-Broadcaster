import type { Specs, Telemetry } from "../net/protocol.ts";
import {
  baseSpecs,
  clampPct,
  type Collector,
  emptyTelemetry,
  firstMatch,
  memory,
  parsePsOutput,
  RateMeter,
  run,
} from "./common.ts";

export function createDarwinCollector(): Collector {
  const rx = new RateMeter();
  const tx = new RateMeter();

  async function cpu(): Promise<number | null> {
    const text = await run("top", ["-l", "1", "-n", "0", "-s", "0"]);
    const idle = Number(firstMatch(text ?? "", /CPU usage:.*?([\d.]+)% idle/));
    return text !== null && Number.isFinite(idle) ? clampPct(100 - idle) : null;
  }

  async function battery(): Promise<Pick<Telemetry, "batteryPct" | "power">> {
    const text = await run("pmset", ["-g", "batt"]);
    if (text === null) return { batteryPct: null, power: null };
    const pct = Number(firstMatch(text, /(\d+)%/));
    return {
      batteryPct: Number.isFinite(pct) ? pct : null,
      power: text.includes("Battery Power") ? "battery" : text.includes("AC Power") ? "ac" : null,
    };
  }

  async function net(now: number): Promise<Pick<Telemetry, "netRxBps" | "netTxBps">> {
    const text = await run("netstat", ["-ibn"]);
    if (text === null) return { netRxBps: null, netTxBps: null };
    let rxBytes = 0;
    let txBytes = 0;
    const seen = new Set<string>();
    for (const line of text.split("\n").slice(1)) {
      const f = line.trim().split(/\s+/);
      const iface = f[0];
      if (iface === undefined || iface.startsWith("lo") || seen.has(iface)) continue;
      if (f.length < 10 || !f[2]?.startsWith("<Link")) continue;
      seen.add(iface);
      rxBytes += Number(f[6] ?? 0);
      txBytes += Number(f[9] ?? 0);
    }
    return { netRxBps: rx.sample(rxBytes, now), netTxBps: tx.sample(txBytes, now) };
  }

  async function topProcs(): Promise<Telemetry["topProcs"]> {
    const text = await run("ps", ["-eo", "pcpu,comm", "-r"]);
    return text === null ? null : parsePsOutput(text);
  }

  return {
    async specs(): Promise<Specs> {
      const specs = baseSpecs();
      const sysctl = await run("sysctl", ["-n", "hw.model", "machdep.cpu.brand_string"]);
      const [model, cpuName] = (sysctl ?? "").split("\n");
      specs.model = model?.trim() || null;
      specs.cpu = cpuName?.trim() || null;
      const version = await run("sw_vers", ["-productVersion"]);
      specs.os = "macOS";
      specs.osVersion = version?.trim() || null;
      const disk = await run("diskutil", ["info", "/"]);
      if (disk !== null) {
        specs.storageType = firstMatch(disk, /Solid State:\s*(\w+)/) === "Yes" ? "SSD" : "HDD";
        const bytes = Number(
          firstMatch(disk, /(?:Container Total Space|Disk Size):.*?\((\d+) Bytes/),
        );
        specs.storageBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : null;
      }
      return specs;
    },

    async telemetry(): Promise<Telemetry> {
      const now = Date.now();
      const [cpuPct, batteryPart, netPart, procs] = await Promise.all([
        cpu(),
        battery(),
        net(now),
        topProcs(),
      ]);
      return {
        ...emptyTelemetry(),
        cpuPct,
        ...(memory() ?? {}),
        ...batteryPart,
        ...netPart,
        topProcs: procs,
      };
    },
  };
}
