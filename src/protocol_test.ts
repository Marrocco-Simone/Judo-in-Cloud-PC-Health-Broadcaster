import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  decodePacket,
  encodePacket,
  MAX_PACKET_BYTES,
  type Packet,
  parsePacket,
  type Telemetry,
} from "./net/protocol.ts";

const fullTelemetry: Telemetry = {
  cpuPct: 42.5,
  perCore: Array.from({ length: 16 }, () => 100),
  ramPct: 88.8,
  ramUsedBytes: 7_512_345_678,
  batteryPct: 100,
  power: "ac",
  wifiPct: 64,
  wifiDbm: -68,
  netRxBps: 123_456_789,
  netTxBps: 98_765_432,
  diskReadBps: 55_555_555,
  diskWriteBps: 44_444_444,
  tempC: 71.5,
  topProcs: [
    { name: "obs-studio-long-process-name", cpuPct: 99.9 },
    { name: "chrome", cpuPct: 33.3 },
    { name: "care-system", cpuPct: 11.1 },
  ],
};

Deno.test("a full telemetry packet stays under the size cap", () => {
  const packet: Packet = {
    v: 1,
    kind: "telemetry",
    number: "22",
    hostname: "a-hostname-that-is-quite-long-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxx",
    sentAt: Date.now(),
    telemetry: fullTelemetry,
  };
  const bytes = encodePacket(packet);
  assertEquals(bytes.byteLength < MAX_PACKET_BYTES, true);
  assertEquals(decodePacket(bytes), packet);
});

Deno.test("encodePacket refuses oversized packets", () => {
  const packet: Packet = {
    v: 1,
    kind: "specs",
    number: "1",
    hostname: "h",
    sentAt: 0,
    specs: {
      model: "x".repeat(2000),
      cpu: null,
      cores: null,
      ramBytes: null,
      storageType: null,
      storageBytes: null,
      os: null,
      osVersion: null,
      kernel: null,
      arch: "x86_64",
    },
  };
  assertThrows(() => encodePacket(packet));
});

Deno.test("parsePacket rejects garbage, wrong versions and missing identity", () => {
  assertEquals(parsePacket("not json"), null);
  assertEquals(parsePacket("[1,2,3]"), null);
  assertEquals(
    parsePacket(JSON.stringify({ v: 2, kind: "telemetry", number: "1", hostname: "h", sentAt: 1 })),
    null,
  );
  assertEquals(
    parsePacket(
      JSON.stringify({ v: 1, kind: "telemetry", hostname: "h", sentAt: 1, telemetry: {} }),
    ),
    null,
  );
  assertEquals(
    parsePacket(
      JSON.stringify({
        v: 1,
        kind: "telemetry",
        number: "",
        hostname: "h",
        sentAt: 1,
        telemetry: {},
      }),
    ),
    null,
  );
  assertEquals(
    parsePacket(JSON.stringify({ v: 1, kind: "reboot", number: "1", hostname: "h", sentAt: 1 })),
    null,
  );
});

Deno.test("parsePacket fills missing or wrong-typed fields with null and truncates strings", () => {
  const packet = parsePacket(JSON.stringify({
    v: 1,
    kind: "telemetry",
    number: "7",
    hostname: "h",
    sentAt: 1,
    telemetry: {
      cpuPct: "90",
      ramPct: 12,
      power: "solar",
      topProcs: [{ name: "x".repeat(100), cpuPct: 1 }, { bad: true }],
    },
  }));
  assertEquals(packet?.kind, "telemetry");
  if (packet?.kind !== "telemetry") return;
  assertEquals(packet.telemetry.cpuPct, null);
  assertEquals(packet.telemetry.ramPct, 12);
  assertEquals(packet.telemetry.power, null);
  assertEquals(packet.telemetry.topProcs, [{ name: "x".repeat(32), cpuPct: 1 }]);
  assertEquals(packet.telemetry.netRxBps, null);
});

Deno.test("parsePacket caps perCore and the number length", () => {
  const packet = parsePacket(JSON.stringify({
    v: 1,
    kind: "telemetry",
    number: "1".repeat(40),
    hostname: "h",
    sentAt: 1,
    telemetry: { perCore: Array.from({ length: 64 }, (_, i) => i) },
  }));
  assertEquals(packet?.number.length, 16);
  assertEquals(packet?.kind === "telemetry" ? packet.telemetry.perCore?.length : 0, 16);
});
