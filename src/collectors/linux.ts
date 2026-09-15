import type { Specs, Telemetry } from "../net/protocol.ts";
import { MAX_PER_CORE } from "../net/protocol.ts";
import {
  attempt,
  baseSpecs,
  type Collector,
  CpuMeter,
  dbmToPct,
  emptyTelemetry,
  firstMatch,
  memory,
  parsePsOutput,
  RateMeter,
  readText,
  round1,
  run,
} from "./common.ts";

const SECTOR_BYTES = 512;
const WHOLE_DISK = /^(sd[a-z]+|nvme\d+n\d+|mmcblk\d+|vd[a-z]+|xvd[a-z]+|hd[a-z]+)$/;

export function createLinuxCollector(): Collector {
  const totalCpu = new CpuMeter();
  const coreCpu = new Map<string, CpuMeter>();
  const rx = new RateMeter();
  const tx = new RateMeter();
  const diskRead = new RateMeter();
  const diskWrite = new RateMeter();

  async function cpu(): Promise<Pick<Telemetry, "cpuPct" | "perCore">> {
    const text = await readText("/proc/stat");
    if (text === null) return { cpuPct: null, perCore: null };
    let cpuPct: number | null = null;
    const perCore: number[] = [];
    for (const line of text.split("\n")) {
      const [name, ...fields] = line.trim().split(/\s+/);
      if (name === undefined || !name.startsWith("cpu")) continue;
      const values = fields.map(Number);
      const total = values.reduce((a, b) => a + b, 0);
      const busy = total - (values[3] ?? 0) - (values[4] ?? 0);
      if (name === "cpu") {
        cpuPct = totalCpu.sample(busy, total);
      } else if (perCore.length < MAX_PER_CORE) {
        const meter = coreCpu.get(name) ?? new CpuMeter();
        coreCpu.set(name, meter);
        const pct = meter.sample(busy, total);
        if (pct !== null) perCore.push(pct);
      }
    }
    return { cpuPct, perCore: perCore.length > 0 ? perCore : null };
  }

  async function net(now: number): Promise<Pick<Telemetry, "netRxBps" | "netTxBps">> {
    const text = await readText("/proc/net/dev");
    if (text === null) return { netRxBps: null, netTxBps: null };
    let rxBytes = 0;
    let txBytes = 0;
    for (const line of text.split("\n").slice(2)) {
      const [iface, rest] = line.split(":");
      if (iface === undefined || rest === undefined || iface.trim() === "lo") continue;
      const f = rest.trim().split(/\s+/).map(Number);
      rxBytes += f[0] ?? 0;
      txBytes += f[8] ?? 0;
    }
    return { netRxBps: rx.sample(rxBytes, now), netTxBps: tx.sample(txBytes, now) };
  }

  async function disk(now: number): Promise<Pick<Telemetry, "diskReadBps" | "diskWriteBps">> {
    const text = await readText("/proc/diskstats");
    if (text === null) return { diskReadBps: null, diskWriteBps: null };
    let readSectors = 0;
    let writeSectors = 0;
    for (const line of text.split("\n")) {
      const f = line.trim().split(/\s+/);
      const name = f[2];
      if (name === undefined || !WHOLE_DISK.test(name)) continue;
      readSectors += Number(f[5] ?? 0);
      writeSectors += Number(f[9] ?? 0);
    }
    return {
      diskReadBps: diskRead.sample(readSectors * SECTOR_BYTES, now),
      diskWriteBps: diskWrite.sample(writeSectors * SECTOR_BYTES, now),
    };
  }

  async function battery(): Promise<Pick<Telemetry, "batteryPct" | "power">> {
    const result: Pick<Telemetry, "batteryPct" | "power"> = { batteryPct: null, power: null };
    const entries = await attempt(() => Array.from(Deno.readDirSync("/sys/class/power_supply")));
    for (const entry of entries ?? []) {
      const base = `/sys/class/power_supply/${entry.name}`;
      const type = (await readText(`${base}/type`))?.trim();
      if (type === "Battery" && result.batteryPct === null) {
        const capacity = Number((await readText(`${base}/capacity`))?.trim());
        if (Number.isFinite(capacity)) result.batteryPct = capacity;
        const status = (await readText(`${base}/status`))?.trim();
        if (status === "Discharging") result.power = "battery";
        else if (status !== undefined) result.power = "ac";
      } else if (type === "Mains") {
        const online = (await readText(`${base}/online`))?.trim();
        if (online === "1") result.power = "ac";
        else if (online === "0") result.power = "battery";
      }
    }
    return result;
  }

  async function wifi(): Promise<Pick<Telemetry, "wifiPct" | "wifiDbm">> {
    const text = await readText("/proc/net/wireless");
    if (text === null) return { wifiPct: null, wifiDbm: null };
    for (const line of text.split("\n").slice(2)) {
      const f = line.trim().split(/\s+/);
      const level = Number(f[3]?.replace(".", ""));
      if (f.length < 4 || !Number.isFinite(level)) continue;
      const dbm = level > 0 ? level - 256 : level;
      return { wifiPct: dbmToPct(dbm), wifiDbm: dbm };
    }
    return { wifiPct: null, wifiDbm: null };
  }

  async function temperature(): Promise<number | null> {
    const raw = await readText("/sys/class/thermal/thermal_zone0/temp");
    const milli = Number(raw?.trim());
    return Number.isFinite(milli) && raw !== null ? round1(milli / 1000) : null;
  }

  async function topProcs(): Promise<Telemetry["topProcs"]> {
    const text = await run("ps", ["-eo", "pcpu,comm", "--sort=-pcpu"]);
    return text === null ? null : parsePsOutput(text);
  }

  return {
    async specs(): Promise<Specs> {
      const specs = baseSpecs();
      const vendor = (await readText("/sys/devices/virtual/dmi/id/sys_vendor"))?.trim() ?? "";
      const product = (await readText("/sys/devices/virtual/dmi/id/product_name"))?.trim() ?? "";
      specs.model = `${vendor} ${product}`.trim() || null;
      const cpuinfo = await readText("/proc/cpuinfo");
      specs.cpu = cpuinfo === null ? null : firstMatch(cpuinfo, /^model name\s*:\s*(.+)$/m);
      const osRelease = await readText("/etc/os-release");
      if (osRelease !== null) {
        specs.os = firstMatch(osRelease, /^PRETTY_NAME="?([^"\n]+)"?$/m);
        specs.osVersion = firstMatch(osRelease, /^VERSION_ID="?([^"\n]+)"?$/m);
      }
      Object.assign(specs, await storage());
      return specs;
    },

    async telemetry(): Promise<Telemetry> {
      const now = Date.now();
      const [cpuPart, netPart, diskPart, batteryPart, wifiPart, tempC, procs] = await Promise.all([
        cpu(),
        net(now),
        disk(now),
        battery(),
        wifi(),
        temperature(),
        topProcs(),
      ]);
      return {
        ...emptyTelemetry(),
        ...cpuPart,
        ...(memory() ?? {}),
        ...netPart,
        ...diskPart,
        ...batteryPart,
        ...wifiPart,
        tempC,
        topProcs: procs,
      };
    },
  };
}

async function storage(): Promise<Pick<Specs, "storageType" | "storageBytes">> {
  const entries = await attempt(() => Array.from(Deno.readDirSync("/sys/block")));
  let best: { bytes: number; type: string } | null = null;
  for (const entry of entries ?? []) {
    if (!WHOLE_DISK.test(entry.name)) continue;
    const sectors = Number((await readText(`/sys/block/${entry.name}/size`))?.trim());
    if (!Number.isFinite(sectors) || sectors === 0) continue;
    const rotational = (await readText(`/sys/block/${entry.name}/queue/rotational`))?.trim();
    const bytes = sectors * SECTOR_BYTES;
    if (best === null || bytes > best.bytes) {
      best = { bytes, type: rotational === "1" ? "HDD" : "SSD" };
    }
  }
  return { storageType: best?.type ?? null, storageBytes: best?.bytes ?? null };
}
