import { assertEquals } from "jsr:@std/assert@1";
import type { Packet, Telemetry } from "./net/protocol.ts";
import { batteryRate, DROP_MS, Fleet, GONE_MS, STALE_MS, statusFor } from "./state.ts";

const telemetry: Telemetry = {
  cpuPct: 10,
  perCore: null,
  ramPct: 50,
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

let sent = 0;
function beat(number: string, hostname: string, sentAt = ++sent): Packet {
  return { v: 1, kind: "telemetry", number, hostname, sentAt, telemetry };
}

Deno.test("the same beat received from several targets is recorded once", () => {
  const fleet = new Fleet(20);
  const packet = beat("4", "pc4", 12345);
  fleet.apply(packet, "local", 0);
  fleet.apply(packet, "10.0.0.4", 1);
  fleet.apply(packet, "10.0.0.4", 2);
  assertEquals(fleet.history.length, 1);
  assertEquals(fleet.snapshot(2)[0]?.sinceLastBeat, 0);
});

Deno.test("statusFor transitions at the stale and gone thresholds", () => {
  assertEquals(statusFor(0), "live");
  assertEquals(statusFor(STALE_MS - 1), "live");
  assertEquals(statusFor(STALE_MS), "stale");
  assertEquals(statusFor(GONE_MS - 1), "stale");
  assertEquals(statusFor(GONE_MS), "gone");
});

Deno.test("a machine goes live -> stale -> gone -> dropped as time passes", () => {
  const fleet = new Fleet();
  fleet.apply(beat("7", "pc7"), "10.0.0.7", 1_000);
  assertEquals(fleet.snapshot(1_000)[0]?.status, "live");
  assertEquals(fleet.snapshot(1_000 + STALE_MS)[0]?.status, "stale");
  assertEquals(fleet.snapshot(1_000 + STALE_MS)[0]?.sinceLastBeat, STALE_MS / 1000);
  assertEquals(fleet.snapshot(1_000 + GONE_MS)[0]?.status, "gone");
  assertEquals(fleet.snapshot(1_000 + DROP_MS).length, 0);
});

Deno.test("a new beat brings a stale machine back to live", () => {
  const fleet = new Fleet();
  fleet.apply(beat("3", "pc3"), "10.0.0.3", 0);
  assertEquals(fleet.snapshot(STALE_MS)[0]?.status, "stale");
  fleet.apply(beat("3", "pc3"), "10.0.0.3", STALE_MS + 500);
  assertEquals(fleet.snapshot(STALE_MS + 600)[0]?.status, "live");
  assertEquals(fleet.snapshot(STALE_MS + 600).length, 1);
});

Deno.test("two hosts with the same number are flagged as duplicates, same host is not", () => {
  const fleet = new Fleet();
  fleet.apply(beat("5", "alpha"), "10.0.0.1", 0);
  fleet.apply(beat("5", "alpha"), "10.0.0.1", 10);
  assertEquals(fleet.snapshot(10).map((m) => m.duplicate), [false]);
  fleet.apply(beat("5", "beta"), "10.0.0.2", 20);
  fleet.apply(beat("6", "gamma"), "10.0.0.3", 20);
  const view = fleet.snapshot(20);
  assertEquals(view.map((m) => [m.number, m.duplicate]), [["5", true], ["5", true], ["6", false]]);
});

Deno.test("specs and telemetry merge on the same machine and history is bounded", () => {
  const fleet = new Fleet(20);
  const specs: Packet = {
    v: 1,
    kind: "specs",
    number: "1",
    hostname: "h",
    sentAt: 0,
    specs: {
      model: "MacBookPro8,1",
      cpu: "i5",
      cores: 4,
      ramBytes: 8e9,
      storageType: "HDD",
      storageBytes: 750e9,
      os: "Ubuntu",
      osVersion: "24.04",
      kernel: "6.8",
      arch: "x86_64",
    },
  };
  fleet.apply(specs, "local", 0);
  for (let i = 0; i < 25; i++) fleet.apply(beat("1", "h"), "local", i);
  const [m] = fleet.snapshot(25);
  assertEquals(m?.specs?.model, "MacBookPro8,1");
  assertEquals(m?.telemetry?.cpuPct, 10);
  assertEquals(fleet.history.length <= 20, true);
  assertEquals(fleet.history.at(-1)?.t, 24);
});

Deno.test("snapshot sorts by numeric label", () => {
  const fleet = new Fleet();
  for (const n of ["10", "2", "1", "22"]) fleet.apply(beat(n, `pc${n}`), "x", 0);
  assertEquals(fleet.snapshot(0).map((m) => m.number), ["1", "2", "10", "22"]);
});

Deno.test("batteryRate needs five minutes of samples and reports points per hour", () => {
  assertEquals(batteryRate([{ t: 0, pct: 90 }, { t: 60_000, pct: 89 }]), null);
  assertEquals(batteryRate([{ t: 0, pct: 90 }, { t: 1_800_000, pct: 84 }]), -12);
  assertEquals(batteryRate([{ t: 0, pct: 50 }, { t: 3_600_000, pct: 65.5 }]), 15.5);
});
