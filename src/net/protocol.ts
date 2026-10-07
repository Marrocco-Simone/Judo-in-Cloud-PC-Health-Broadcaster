export const PROTOCOL_VERSION = 1;
export const UDP_PORT = 47474;
export const MAX_PACKET_BYTES = 1200;
export const MAX_TOP_PROCESSES = 3;
export const MAX_PER_CORE = 16;

export interface Specs {
  model: string | null;
  cpu: string | null;
  cores: number | null;
  ramBytes: number | null;
  storageType: string | null;
  storageBytes: number | null;
  os: string | null;
  osVersion: string | null;
  kernel: string | null;
  arch: string;
}

export interface TopProcess {
  name: string;
  cpuPct: number;
}

export type PowerSource = "battery" | "ac";

/** seconds without a stored chunk before the page shows the recording as stopped */
export const CARE_CHUNK_ALARM_S = 10;
/** seconds without a new care-status.json before the page shows the care system as not running */
export const CARE_STALE_S = 120;

export type CameraState = "live" | "muted" | "ended";
export type StreamState = "idle" | "connecting" | "live";

/** State of the care system on this PC, from the care-status.json of the Electron app */
export interface CareStatus {
  /** seconds since the app wrote the file */
  age: number;
  ver: string | null;
  /** app uptime, seconds */
  up: number | null;
  /** seconds since the last chunk stored in IndexedDB */
  chunkAge: number | null;
  /** the per-minute values below cover the last full minute */
  storeErr: number | null;
  /** stored bitrate, kbit/s */
  kbps: number | null;
  cam: CameraState | null;
  /** camera mute and ended events */
  camEv: number | null;
  w: number | null;
  h: number | null;
  fps: number | null;
  /** average live delay of the player, seconds; null while the referee reviews */
  delay: number | null;
  /** dropped frames of the player, percent */
  drop: number | null;
  /** IndexedDB usage and space left, MB */
  dbMB: number | null;
  freeMB: number | null;
  /** worst main thread delay, ms */
  lag: number | null;
  stream: StreamState | null;
  /** failed YouTube upload attempts */
  upFail: number | null;
  /** the PC has a hardware H.264 encoder */
  hw: boolean | null;
  /** CPU of all app processes, percent of the whole machine */
  cpu: number | null;
  memMB: number | null;
}

export const CARE_FIELDS = [
  "age",
  "ver",
  "up",
  "chunkAge",
  "storeErr",
  "kbps",
  "cam",
  "camEv",
  "w",
  "h",
  "fps",
  "delay",
  "drop",
  "dbMB",
  "freeMB",
  "lag",
  "stream",
  "upFail",
  "hw",
  "cpu",
  "memMB",
] as const satisfies readonly (keyof CareStatus)[];

export interface Telemetry {
  cpuPct: number | null;
  perCore: number[] | null;
  ramPct: number | null;
  ramUsedBytes: number | null;
  batteryPct: number | null;
  power: PowerSource | null;
  wifiPct: number | null;
  wifiDbm: number | null;
  netRxBps: number | null;
  netTxBps: number | null;
  diskReadBps: number | null;
  diskWriteBps: number | null;
  tempC: number | null;
  topProcs: TopProcess[] | null;
  care: CareStatus | null;
}

interface PacketBase {
  v: typeof PROTOCOL_VERSION;
  number: string;
  hostname: string;
  sentAt: number;
}

export type Packet =
  | (PacketBase & { kind: "specs"; specs: Specs })
  | (PacketBase & { kind: "telemetry"; telemetry: Telemetry });

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodePacket(packet: Packet): Uint8Array {
  const bytes = encoder.encode(JSON.stringify(packet));
  if (bytes.byteLength > MAX_PACKET_BYTES) {
    throw new Error(`packet too large: ${bytes.byteLength} bytes`);
  }
  return bytes;
}

export function decodePacket(bytes: Uint8Array): Packet | null {
  if (bytes.byteLength > MAX_PACKET_BYTES) return null;
  try {
    return parsePacket(decoder.decode(bytes));
  } catch {
    return null;
  }
}

export function parsePacket(text: string): Packet | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION) return null;
  const number = str(raw.number, 16);
  const hostname = str(raw.hostname, 64);
  const sentAt = num(raw.sentAt);
  if (number === null || number === "" || hostname === null || sentAt === null) return null;
  const base: PacketBase = { v: PROTOCOL_VERSION, number, hostname, sentAt };
  if (raw.kind === "specs" && isRecord(raw.specs)) {
    return { ...base, kind: "specs", specs: parseSpecs(raw.specs) };
  }
  if (raw.kind === "telemetry" && isRecord(raw.telemetry)) {
    return { ...base, kind: "telemetry", telemetry: parseTelemetry(raw.telemetry) };
  }
  return null;
}

function parseSpecs(r: Record<string, unknown>): Specs {
  return {
    model: str(r.model, 80),
    cpu: str(r.cpu, 80),
    cores: num(r.cores),
    ramBytes: num(r.ramBytes),
    storageType: str(r.storageType, 16),
    storageBytes: num(r.storageBytes),
    os: str(r.os, 80),
    osVersion: str(r.osVersion, 40),
    kernel: str(r.kernel, 60),
    arch: str(r.arch, 20) ?? "unknown",
  };
}

function parseTelemetry(r: Record<string, unknown>): Telemetry {
  return {
    cpuPct: num(r.cpuPct),
    perCore: numArray(r.perCore, MAX_PER_CORE),
    ramPct: num(r.ramPct),
    ramUsedBytes: num(r.ramUsedBytes),
    batteryPct: num(r.batteryPct),
    power: r.power === "battery" || r.power === "ac" ? r.power : null,
    wifiPct: num(r.wifiPct),
    wifiDbm: num(r.wifiDbm),
    netRxBps: num(r.netRxBps),
    netTxBps: num(r.netTxBps),
    diskReadBps: num(r.diskReadBps),
    diskWriteBps: num(r.diskWriteBps),
    tempC: num(r.tempC),
    topProcs: topProcs(r.topProcs),
    care: isRecord(r.care) ? parseCare(r.care) : null,
  };
}

export function parseCare(r: Record<string, unknown>): CareStatus | null {
  const age = num(r.age);
  if (age === null) return null;
  return {
    age,
    ver: str(r.ver, 16),
    up: num(r.up),
    chunkAge: num(r.chunkAge),
    storeErr: num(r.storeErr),
    kbps: num(r.kbps),
    cam: r.cam === "live" || r.cam === "muted" || r.cam === "ended" ? r.cam : null,
    camEv: num(r.camEv),
    w: num(r.w),
    h: num(r.h),
    fps: num(r.fps),
    delay: num(r.delay),
    drop: num(r.drop),
    dbMB: num(r.dbMB),
    freeMB: num(r.freeMB),
    lag: num(r.lag),
    stream: r.stream === "idle" || r.stream === "connecting" || r.stream === "live"
      ? r.stream
      : null,
    upFail: num(r.upFail),
    hw: typeof r.hw === "boolean" ? r.hw : null,
    cpu: num(r.cpu),
    memMB: num(r.memMB),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function numArray(v: unknown, max: number): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const item of v.slice(0, max)) {
    const n = num(item);
    if (n !== null) out.push(n);
  }
  return out;
}

function topProcs(v: unknown): TopProcess[] | null {
  if (!Array.isArray(v)) return null;
  const out: TopProcess[] = [];
  for (const item of v.slice(0, MAX_TOP_PROCESSES)) {
    if (!isRecord(item)) continue;
    const name = str(item.name, 32);
    const cpuPct = num(item.cpuPct);
    if (name !== null && cpuPct !== null) out.push({ name, cpuPct });
  }
  return out;
}
