import denoJson from "../deno.json" with { type: "json" };
import { HELP, parseArgs } from "./args.ts";
import type { Collector } from "./collectors/common.ts";
import { createDarwinCollector } from "./collectors/darwin.ts";
import { createLinuxCollector } from "./collectors/linux.ts";
import { createWindowsCollector } from "./collectors/windows.ts";
import { isValidNumber, readNumber, readPeersFile, writeNumber } from "./identity.ts";
import { initialPhaseMs, nextDelayMs, Sender, SPECS_EVERY_BEATS } from "./net/broadcast.ts";
import { openSocket, receiveLoop } from "./net/listen.ts";
import { encodePacket, type Packet, PROTOCOL_VERSION } from "./net/protocol.ts";
import { Fleet } from "./state.ts";
import { openBrowser, startUi } from "./ui/server.ts";

const VERSION: string = denoJson.version;

function createCollector(): Collector {
  switch (Deno.build.os) {
    case "linux":
      return createLinuxCollector();
    case "windows":
      return createWindowsCollector();
    default:
      return createDarwinCollector();
  }
}

function hostname(): string {
  try {
    return Deno.hostname();
  } catch {
    return "unknown";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args);
  if (args.help) {
    console.log(HELP);
    return;
  }
  const collector = createCollector();
  const host = hostname();

  if (args.once) {
    const specs = await collector.specs();
    await collector.telemetry(0);
    await sleep(1_000);
    const telemetry = await collector.telemetry(1);
    console.log(JSON.stringify({ version: VERSION, hostname: host, specs, telemetry }, null, 2));
    return;
  }

  let number: string | null = args.number ?? readNumber();
  if (number !== null && !isValidNumber(number)) {
    console.error(`numero non valido: ${number}`);
    Deno.exit(1);
  }
  if (number === null && args.noUi) {
    if (Deno.stdin.isTerminal()) {
      number = prompt("Numero dell'etichetta di questo PC:")?.trim() ?? null;
      if (number === null || !isValidNumber(number)) {
        console.error("numero non valido");
        Deno.exit(1);
      }
      console.log(`salvato in ${writeNumber(number)}`);
    } else {
      console.error("manca pc-number.txt accanto all'eseguibile (oppure usa --number=<n>)");
      Deno.exit(1);
    }
  }

  const fleet = new Fleet();
  const peers = [...new Set([...readPeersFile(), ...args.peers])];
  const conn = openSocket(args.port);
  const sender = new Sender(conn, args.port, peers);

  receiveLoop(conn, (packet, from) => fleet.apply(packet, from)).catch((err: unknown) => {
    console.error("ricezione interrotta:", err);
  });

  if (!args.noUi) {
    const uiPort = startUi({
      fleet,
      version: VERSION,
      udpPort: args.port,
      targets: () => sender.targets(),
      self: () => ({ number, hostname: host }),
      setNumber: (value) => {
        const path = writeNumber(value);
        number = value;
        return path;
      },
    }, args.uiPort);
    const url = `http://127.0.0.1:${uiPort}/`;
    console.log(`pagina di controllo: ${url}`);
    await openBrowser(url);
  }

  console.log(
    `pc-health-broadcaster v${VERSION} · host ${host} · UDP ${args.port} · peers ${
      peers.length > 0 ? peers.join(",") : "-"
    }`,
  );

  let specs = await collector.specs();
  let beat = 0;
  await sleep(initialPhaseMs());
  while (true) {
    if (number !== null) {
      const base = { v: PROTOCOL_VERSION, number, hostname: host, sentAt: Date.now() } as const;
      try {
        if (beat % SPECS_EVERY_BEATS === 0) {
          if (beat > 0) specs = await collector.specs();
          await publish(sender, fleet, { ...base, kind: "specs", specs });
        }
        const telemetry = await collector.telemetry(beat);
        await publish(sender, fleet, { ...base, kind: "telemetry", telemetry });
      } catch (err) {
        console.error("beat saltato:", err instanceof Error ? err.message : err);
      }
      beat++;
    }
    await sleep(nextDelayMs());
  }
}

async function publish(sender: Sender, fleet: Fleet, packet: Packet): Promise<void> {
  fleet.apply(packet, "local");
  await sender.send(encodePacket(packet));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  Deno.exit(1);
});
