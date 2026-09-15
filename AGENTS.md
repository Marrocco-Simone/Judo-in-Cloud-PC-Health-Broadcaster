# AGENTS.md

Guidance for AI agents that work in this repository.

## What this is

PC Health Broadcaster is a single Deno 2 executable for the Judo in Cloud competition PCs. Every PC
broadcasts its telemetry over UDP on the local network; every PC also listens and serves a local web
page that shows the whole fleet. There is no server, no account and no installation. The
requirements document lives in the private `laptops/` folder of the owner and is summarized in
`README.md` (section "Requisiti").

## Layout

- `src/main.ts` — entry point: args, identity, socket, UI, beat loop.
- `src/args.ts` — CLI flags. `src/identity.ts` — `pc-number.txt` and `peers.txt` lookup.
- `src/collectors/{common,linux,windows,darwin}.ts` — telemetry and specs per OS. Every collector
  returns `null` for a value it cannot read; a collector never throws out of `telemetry()`.
- `src/net/protocol.ts` — packet types, strict parser, size cap. `broadcast.ts` — interval
  randomization and sender. `listen.ts` — UDP socket and receive loop.
- `src/state.ts` — fleet table, live/stale/gone, duplicate numbers, bounded history.
- `src/ui/server.ts` — local HTTP on 127.0.0.1. `src/ui/page.ts` — the whole page as a string.
- `src/*_test.ts` — unit tests, run with `deno test`.

## Rules

- Strict TypeScript, no `any`. Narrow `unknown`.
- No runtime dependencies. Tests may use `jsr:@std/assert`.
- Keep packets under `MAX_PACKET_BYTES` (1200). A new telemetry field needs: the `Telemetry`
  interface, `parseTelemetry`, `emptyTelemetry`, every collector, the page and the CSV header.
- Never transmit credentials, athlete names, file paths or anything the receiver could execute.
  Incoming packets are parsed as telemetry only.
- Telemetry collection runs once per beat (10 s ± 3 s). Do not add polling faster than the beat and
  do not add continuous disk writes. The only file the app writes is `pc-number.txt`.
- The UI listens on 127.0.0.1 only. Do not bind it to other interfaces.
- Verify with `deno task check` and `deno test`. Compile with `deno task compile:<target>`.
- Version lives in `deno.json`; the release workflow reads it and tags `v<version>`.
