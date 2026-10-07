import { assertEquals } from "jsr:@std/assert@1";
import { CSV_HEADER, csvLine, Recorder } from "./record.ts";
import type { CareStatus } from "./net/protocol.ts";
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
  assertEquals(line.includes(',"obs, ""64""",30,'), true);
});

Deno.test("csvLine writes the care fields in header order", () => {
  const care: CareStatus = {
    age: 4,
    ver: "1.8.2",
    up: 600,
    chunkAge: 1,
    storeErr: 0,
    kbps: 1950,
    cam: "live",
    camEv: 0,
    w: 1920,
    h: 1080,
    fps: 30,
    delay: 2.5,
    drop: 0.4,
    dbMB: 812,
    freeMB: 40210,
    lag: 35,
    stream: "live",
    upFail: 1,
    hw: true,
    cpu: 23.5,
    memMB: 612,
  };
  const line = csvLine({ ...entry, telemetry: { ...entry.telemetry, care } }, {
    role: "",
    tatami: "",
  });
  assertEquals(
    line.endsWith(
      ",4,1.8.2,600,1,0,1950,live,0,1920,1080,30,2.5,0.4,812,40210,35,live,1,true,23.5,612",
    ),
    true,
  );
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
