import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { parseArgs } from "./args.ts";
import { isValidNumber } from "./identity.ts";

Deno.test("parseArgs reads flags and values", () => {
  const args = parseArgs(["--no-ui", "--peers=10.0.0.1, 10.0.0.2", "--port=5000", "--number=7"]);
  assertEquals(args.noUi, true);
  assertEquals(args.peers, ["10.0.0.1", "10.0.0.2"]);
  assertEquals(args.port, 5000);
  assertEquals(args.number, "7");
  assertEquals(args.uiPort, 47475);
  assertThrows(() => parseArgs(["--reboot"]));
});

Deno.test("isValidNumber accepts label numbers and rejects paths", () => {
  assertEquals(isValidNumber("7"), true);
  assertEquals(isValidNumber("22"), true);
  assertEquals(isValidNumber("T3-obs"), true);
  assertEquals(isValidNumber(""), false);
  assertEquals(isValidNumber("../x"), false);
  assertEquals(isValidNumber("a".repeat(17)), false);
});
