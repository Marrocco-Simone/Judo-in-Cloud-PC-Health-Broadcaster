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
- `src/state.ts` — fleet table, live/stale/gone, duplicate numbers, bounded history, `onEntry`
  listeners. The same beat arrives once per broadcast target; `lastRecordedSentAt` dedupes it.
- `src/record.ts` — `--record`: appends received beats to a CSV file in 30 s batches. The only disk
  write besides `pc-number.txt`, meant for the control machine.
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
  do not add continuous disk writes. Without `--record` the only file the app writes is
  `pc-number.txt`.
- The UI listens on 127.0.0.1 only. Do not bind it to other interfaces.
- Verify with `deno task check` and `deno test`. Compile with `deno task compile:<target>`.
- Version lives in `deno.json`; the release workflow reads it and tags `v<version>`.

## Testing on a real machine

The Linux and Windows collectors can only be verified on that OS. macOS is a development
environment, not part of the fleet. The cycle is:

1. Change the code, run `deno task check` and `deno task test`.
2. Bump the third number of `version` in `deno.json` (`0.1.2` → `0.1.3`). Every test on a real
   machine needs a new release, because the machine downloads the compiled file.
3. Commit and push to `main`. The Release workflow builds the four targets, the `.deb` and the
   checksums, and publishes `v<version>` in about one minute.
4. On the target machine, `pc-health-broadcaster --version` confirms the running version, and
   `pc-health-broadcaster --once` prints local specs and telemetry as JSON. A `null` field is a
   collector that cannot read that value on that machine: fix the collector, not the page.

## Debugging a collector

- `readText` in `src/collectors/common.ts` returns `null` on any error. To see the real error, add a
  temporary `console.error` in its `catch`, and remove it before the commit.
- Every task and every `compile:` target uses `--allow-all`. Deno 2 refuses `/proc` and `/sys` with
  `NotCapable: Requires all access` under any narrower grant, `--allow-read` and
  `--allow-read=/proc,/sys` included. Reintroducing the flag list silently empties the whole Linux
  collector: only hostname, RAM, OS, kernel and `ps` survive.
- Linux sources: `/proc/stat` (CPU), `/proc/cpuinfo` (CPU name), `/sys/devices/virtual/dmi/id/`
  (model), `/sys/block/*/size` and `queue/rotational` (storage), `/proc/net/dev` (network),
  `/proc/diskstats` (disk), `/proc/net/wireless` (wifi), `/sys/class/power_supply/*` (battery),
  `/sys/class/thermal/thermal_zone0/temp`. Check them with `cat` before changing the parser.
- Windows sources: one PowerShell call per beat with CIM performance counters,
  `netsh wlan show
  interfaces` for wifi. Counter names are locale independent; do not use
  `typeperf`. On Windows 11 `netsh wlan` needs location services enabled; otherwise it prints
  "access denied" and the wifi stays `null`. Windows 10 does not require this. Temperature comes
  from the `ThermalZoneInformation` counters, then `MSAcpi_ThermalZoneTemperature`; some firmware
  exposes neither.
- Rate values (network, disk, CPU) are `null` on the first beat by design: they need two samples.
- Firewall: a PC that transmits but does not receive has inbound UDP 47474 blocked. Omarchy and some
  Ubuntu installs enable `ufw` by default: `sudo ufw allow 47474/udp`. This is a documentation
  matter, the app must not change firewall rules.
