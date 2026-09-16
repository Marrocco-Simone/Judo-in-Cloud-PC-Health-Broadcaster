import type { Specs, Telemetry, TopProcess } from "../net/protocol.ts";
import { MAX_PER_CORE, MAX_TOP_PROCESSES } from "../net/protocol.ts";
import {
  baseSpecs,
  clampPct,
  type Collector,
  emptyTelemetry,
  firstMatch,
  memory,
  RateMeter,
  round1,
  run,
} from "./common.ts";

export const PROCS_EVERY_BEATS = 3;

const PS_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"];

const TELEMETRY_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$o=@{}
$o.cpu=@(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Select-Object Name,PercentProcessorTime)
$o.bat=Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus
$o.net=@(Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface | Select-Object BytesReceivedPersec,BytesSentPersec)
$o.disk=Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk -Filter "Name='_Total'" | Select-Object DiskReadBytesPersec,DiskWriteBytesPersec
$o.temp=@(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation | Select-Object Temperature)
if ($o.temp.Count -eq 0) { $o.temp=@(Get-CimInstance -Namespace root\\WMI MSAcpi_ThermalZoneTemperature | Select-Object @{n='Temperature';e={$_.CurrentTemperature/10}}) }
$o.wifi=(netsh wlan show interfaces | Select-String '%' | Select-Object -First 1).Line
`;

const PROCS_SCRIPT = `
$o.procs=@(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } | Group-Object { $_.Name -replace '#\\d+$','' } | ForEach-Object { [pscustomobject]@{Name=$_.Name;PercentProcessorTime=($_.Group | Measure-Object PercentProcessorTime -Sum).Sum} } | Sort-Object PercentProcessorTime -Descending | Select-Object -First ${MAX_TOP_PROCESSES} Name,PercentProcessorTime)
`;

const EMIT = `$o | ConvertTo-Json -Compress -Depth 3`;

const SPECS_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$cs=Get-CimInstance Win32_ComputerSystem
$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1
$os=Get-CimInstance Win32_OperatingSystem
$disk=Get-CimInstance -Namespace root\\Microsoft\\Windows\\Storage MSFT_PhysicalDisk | Sort-Object Size -Descending | Select-Object -First 1
@{model=("$($cs.Manufacturer) $($cs.Model)").Trim();cpu=$cpu.Name;cores=$cpu.NumberOfLogicalProcessors;os=$os.Caption;osVersion="$($os.Version) build $($os.BuildNumber)";mediaType=$disk.MediaType;storageBytes=$disk.Size} | ConvertTo-Json -Compress
`;

interface RawTelemetry {
  cpu?: unknown;
  bat?: unknown;
  net?: unknown;
  disk?: unknown;
  temp?: unknown;
  wifi?: unknown;
  procs?: unknown;
}

export function createWindowsCollector(): Collector {
  const rx = new RateMeter();
  const tx = new RateMeter();
  const diskRead = new RateMeter();
  const diskWrite = new RateMeter();
  let lastProcs: TopProcess[] | null = null;

  return {
    async specs(): Promise<Specs> {
      const specs = baseSpecs();
      const raw = parseJson(await run("powershell", [...PS_ARGS, SPECS_SCRIPT], 30_000));
      if (raw === null) return specs;
      specs.model = optString(raw.model);
      specs.cpu = optString(raw.cpu);
      specs.cores = optNumber(raw.cores) ?? specs.cores;
      specs.os = optString(raw.os);
      specs.osVersion = optString(raw.osVersion);
      specs.storageBytes = optNumber(raw.storageBytes);
      const mediaType = optNumber(raw.mediaType);
      specs.storageType = mediaType === 4 ? "SSD" : mediaType === 3 ? "HDD" : null;
      return specs;
    },

    async telemetry(beat: number): Promise<Telemetry> {
      const withProcs = beat % PROCS_EVERY_BEATS === 0;
      const script = TELEMETRY_SCRIPT + (withProcs ? PROCS_SCRIPT : "") + EMIT;
      const [rawText, wifiText] = await Promise.all([
        run("powershell", [...PS_ARGS, script], 20_000),
        run("netsh", ["wlan", "show", "interfaces"]),
      ]);
      const now = Date.now();
      const raw: RawTelemetry = parseJson(rawText) ?? {};
      const cores = navigator.hardwareConcurrency;
      if (withProcs && Array.isArray(raw.procs)) {
        lastProcs = raw.procs.flatMap((p: unknown) => {
          if (!isRecord(p)) return [];
          const name = optString(p.Name);
          const pct = optNumber(p.PercentProcessorTime);
          return name === null || pct === null ? [] : [{ name, cpuPct: round1(pct / cores) }];
        });
      }
      const wifiLine = wifiText ?? optString(raw.wifi);
      const wifiPct = wifiLine === null ? null : Number(firstMatch(wifiLine, /:\s*(\d+)%\s*$/m));
      return {
        ...emptyTelemetry(),
        ...cpu(raw.cpu),
        ...(memory() ?? {}),
        ...battery(raw.bat),
        ...net(raw.net, now, rx, tx),
        ...disk(raw.disk, now, diskRead, diskWrite),
        wifiPct: Number.isFinite(wifiPct) ? wifiPct : null,
        tempC: temperature(raw.temp),
        topProcs: lastProcs,
      };
    },
  };
}

function cpu(raw: unknown): Pick<Telemetry, "cpuPct" | "perCore"> {
  if (!Array.isArray(raw)) return { cpuPct: null, perCore: null };
  let cpuPct: number | null = null;
  const perCore: number[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const pct = optNumber(item.PercentProcessorTime);
    if (pct === null) continue;
    if (item.Name === "_Total") cpuPct = clampPct(pct);
    else if (perCore.length < MAX_PER_CORE) perCore.push(clampPct(pct));
  }
  return { cpuPct, perCore: perCore.length > 0 ? perCore : null };
}

function battery(raw: unknown): Pick<Telemetry, "batteryPct" | "power"> {
  if (!isRecord(raw)) return { batteryPct: null, power: null };
  const status = optNumber(raw.BatteryStatus);
  return {
    batteryPct: optNumber(raw.EstimatedChargeRemaining),
    power: status === null ? null : status === 1 ? "battery" : "ac",
  };
}

function net(
  raw: unknown,
  now: number,
  rx: RateMeter,
  tx: RateMeter,
): Pick<Telemetry, "netRxBps" | "netTxBps"> {
  if (!Array.isArray(raw)) return { netRxBps: null, netTxBps: null };
  let rxBytes = 0;
  let txBytes = 0;
  for (const item of raw) {
    if (!isRecord(item)) continue;
    rxBytes += optNumber(item.BytesReceivedPersec) ?? 0;
    txBytes += optNumber(item.BytesSentPersec) ?? 0;
  }
  return { netRxBps: rx.sample(rxBytes, now), netTxBps: tx.sample(txBytes, now) };
}

function disk(
  raw: unknown,
  now: number,
  read: RateMeter,
  write: RateMeter,
): Pick<Telemetry, "diskReadBps" | "diskWriteBps"> {
  if (!isRecord(raw)) return { diskReadBps: null, diskWriteBps: null };
  const r = optNumber(raw.DiskReadBytesPersec);
  const w = optNumber(raw.DiskWriteBytesPersec);
  return {
    diskReadBps: r === null ? null : read.sample(r, now),
    diskWriteBps: w === null ? null : write.sample(w, now),
  };
}

/** Thermal zone counters report Kelvin; the hottest zone is the one that matters. */
function temperature(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;
  let max: number | null = null;
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const kelvin = optNumber(item.Temperature);
    if (kelvin === null || kelvin < 200) continue;
    max = max === null ? kelvin : Math.max(max, kelvin);
  }
  return max === null ? null : round1(max - 273.15);
}

function parseJson(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function optNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
