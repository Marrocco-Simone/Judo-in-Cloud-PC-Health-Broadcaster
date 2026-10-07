import { assertEquals } from "jsr:@std/assert@1";
import { careFromFile } from "./care.ts";

const now = Date.UTC(2026, 9, 10, 9, 0, 0);

Deno.test("careFromFile measures the file and chunk ages at read time", () => {
  const care = careFromFile(
    { lastChunkAt: now - 4_000, kbps: 2000, cam: "live", stream: "idle", hw: true, ver: "1.8.2" },
    now - 9_000,
    now,
  );
  assertEquals(care?.age, 9);
  assertEquals(care?.chunkAge, 4);
  assertEquals(care?.kbps, 2000);
  assertEquals(care?.cam, "live");
  assertEquals(care?.hw, true);
});

Deno.test("careFromFile drops unknown and invalid values", () => {
  const care = careFromFile(
    { lastChunkAt: null, kbps: "fast", cam: "broken", stream: 3, hw: "yes", extra: 1 },
    now,
    now,
  );
  assertEquals(care?.chunkAge, null);
  assertEquals(care?.kbps, null);
  assertEquals(care?.cam, null);
  assertEquals(care?.stream, null);
  assertEquals(care?.hw, null);
  assertEquals(care !== null && "extra" in care, false);
});

Deno.test("careFromFile rejects a file that is not an object", () => {
  assertEquals(careFromFile([1, 2], now, now), null);
  assertEquals(careFromFile("text", now, now), null);
});
