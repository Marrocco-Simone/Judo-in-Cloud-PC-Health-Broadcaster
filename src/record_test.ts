import { assertEquals } from "jsr:@std/assert@1";
import { CSV_HEADER, csvLine, Recorder } from "./record.ts";
import type { HistoryEntry } from "./state.ts";
import { emptyTelemetry } from "./collectors/common.ts";

const entry: HistoryEntry = {
  t: Date.UTC(2026, 9, 10, 9, 0, 0),
  number: "7",
  hostname: "tatami-3",
  telemetry: {
    ...emptyTelemetry(),
    cpuPct: 42.5,
    topProcs: [{ name: 'obs, "64"', cpuPct: 30 }],
  },
};

Deno.test("csvLine quotes commas and doubles quotes", () => {
  const line = csvLine(entry, { role: "streaming", tatami: "3" });
  assertEquals(line.split(",").length, CSV_HEADER.split(",").length + 1);
  assertEquals(line.startsWith("2026-10-10T09:00:00.000Z,7,tatami-3,streaming,3,42.5,"), true);
  assertEquals(line.endsWith(',"obs, ""64""",30'), true);
});

Deno.test("Recorder appends a header once and then only lines", async () => {
  const dir = await Deno.makeTempDir();
  const path = `${dir}/session.csv`;
  const recorder = new Recorder(path);
  recorder.roles = { "7": { role: "care", tatami: "1" } };
  recorder.add(entry);
  await recorder.flush();
  recorder.add(entry);
  await recorder.close();
  const lines = (await Deno.readTextFile(path)).trimEnd().split("\n");
  assertEquals(lines.length, 3);
  assertEquals(lines[0], CSV_HEADER);
  assertEquals(lines[1]?.includes(",care,1,"), true);
  await Deno.remove(dir, { recursive: true });
});
