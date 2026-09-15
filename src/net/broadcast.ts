export const BEAT_BASE_MS = 10_000;
export const BEAT_JITTER_MS = 3_000;
export const INITIAL_PHASE_MAX_MS = 10_000;
export const SPECS_EVERY_BEATS = 10;
export const LIMITED_BROADCAST = "255.255.255.255";

export function nextDelayMs(rand: () => number = Math.random): number {
  return Math.round(BEAT_BASE_MS + (rand() * 2 - 1) * BEAT_JITTER_MS);
}

export function initialPhaseMs(rand: () => number = Math.random): number {
  return Math.round(rand() * INITIAL_PHASE_MAX_MS);
}

export function interfaceBroadcasts(): string[] {
  const out = new Set<string>();
  try {
    for (const iface of Deno.networkInterfaces()) {
      if (iface.family !== "IPv4" || iface.address.startsWith("127.")) continue;
      const address = ipv4ToInt(iface.address);
      const mask = ipv4ToInt(iface.netmask);
      if (address === null || mask === null) continue;
      out.add(intToIpv4((address | (~mask >>> 0)) >>> 0));
    }
  } catch {
    return [];
  }
  return [...out];
}

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return parts.reduce((acc, p) => ((acc << 8) | p) >>> 0, 0);
}

export function intToIpv4(n: number): string {
  return [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join(".");
}

export class Sender {
  constructor(
    private readonly conn: Deno.DatagramConn,
    private readonly port: number,
    private readonly peers: string[],
  ) {}

  targets(): string[] {
    return [...new Set([LIMITED_BROADCAST, ...interfaceBroadcasts(), ...this.peers])];
  }

  async send(bytes: Uint8Array): Promise<number> {
    let delivered = 0;
    for (const hostname of this.targets()) {
      try {
        await this.conn.send(bytes, { transport: "udp", hostname, port: this.port });
        delivered++;
      } catch {
        // an unreachable target is expected on poor networks (RN-6)
      }
    }
    return delivered;
  }
}
