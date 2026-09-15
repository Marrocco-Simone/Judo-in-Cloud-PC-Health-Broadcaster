import { decodePacket, type Packet } from "./protocol.ts";

export function openSocket(port: number): Deno.DatagramConn {
  return Deno.listenDatagram({ transport: "udp", hostname: "0.0.0.0", port, reuseAddress: true });
}

export async function receiveLoop(
  conn: Deno.DatagramConn,
  onPacket: (packet: Packet, from: string) => void,
): Promise<void> {
  for await (const [bytes, addr] of conn) {
    const packet = decodePacket(bytes);
    if (packet === null) continue;
    onPacket(packet, addr.transport === "udp" ? addr.hostname : "?");
  }
}
