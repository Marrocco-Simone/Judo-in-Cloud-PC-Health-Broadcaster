import { assertEquals } from "jsr:@std/assert@1";
import {
  BEAT_BASE_MS,
  BEAT_JITTER_MS,
  INITIAL_PHASE_MAX_MS,
  initialPhaseMs,
  intToIpv4,
  ipv4ToInt,
  nextDelayMs,
} from "./net/broadcast.ts";

Deno.test("nextDelayMs stays within base ± jitter", () => {
  assertEquals(nextDelayMs(() => 0), BEAT_BASE_MS - BEAT_JITTER_MS);
  assertEquals(nextDelayMs(() => 0.5), BEAT_BASE_MS);
  assertEquals(nextDelayMs(() => 0.999999), BEAT_BASE_MS + BEAT_JITTER_MS);
  for (let i = 0; i < 1000; i++) {
    const d = nextDelayMs();
    assertEquals(d >= BEAT_BASE_MS - BEAT_JITTER_MS && d <= BEAT_BASE_MS + BEAT_JITTER_MS, true);
  }
});

Deno.test("nextDelayMs is not constant", () => {
  const values = new Set(Array.from({ length: 50 }, () => nextDelayMs()));
  assertEquals(values.size > 1, true);
});

Deno.test("initialPhaseMs stays within 0 and the max phase", () => {
  assertEquals(initialPhaseMs(() => 0), 0);
  assertEquals(initialPhaseMs(() => 0.999999), INITIAL_PHASE_MAX_MS);
  for (let i = 0; i < 1000; i++) {
    const p = initialPhaseMs();
    assertEquals(p >= 0 && p <= INITIAL_PHASE_MAX_MS, true);
  }
});

Deno.test("directed broadcast address from address and netmask", () => {
  const addr = ipv4ToInt("192.168.1.37");
  const mask = ipv4ToInt("255.255.255.0");
  if (addr === null || mask === null) throw new Error("parse failed");
  assertEquals(intToIpv4((addr | (~mask >>> 0)) >>> 0), "192.168.1.255");
  assertEquals(ipv4ToInt("300.1.1.1"), null);
  assertEquals(ipv4ToInt("1.2.3"), null);
});
