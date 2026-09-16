import { UDP_PORT } from "./net/protocol.ts";

export const UI_PORT = 47475;

export interface Args {
  noUi: boolean;
  once: boolean;
  help: boolean;
  version: boolean;
  number: string | null;
  peers: string[];
  port: number;
  uiPort: number;
  /** null: off; "": default file next to the executable; otherwise the file path */
  record: string | null;
}

export const HELP = `pc-health-broadcaster [options]

  --once            print the local specs and telemetry as JSON, then exit
  --no-ui           do not start the local web page and do not open the browser
  --number=<id>     use this PC number instead of pc-number.txt
  --peers=<a,b,c>   unicast every beat to these IPs too (added to peers.txt)
  --port=<n>        UDP port for broadcast and listening (default ${UDP_PORT})
  --ui-port=<n>     first port tried for the local web page (default ${UI_PORT})
  --record[=<file>] append every received beat to a CSV file (default pc-health_<date>.csv
                    next to the executable); use it on the control machine only
  --version         print the version, then exit
  --help            show this text
`;

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    noUi: false,
    once: false,
    help: false,
    version: false,
    number: null,
    peers: [],
    port: UDP_PORT,
    uiPort: UI_PORT,
    record: null,
  };
  for (const arg of argv) {
    const [flag, value = ""] = splitFlag(arg);
    switch (flag) {
      case "--no-ui":
        args.noUi = true;
        break;
      case "--once":
        args.once = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
        args.version = true;
        break;
      case "--number":
        args.number = value.trim() || null;
        break;
      case "--peers":
        args.peers = value.split(",").map((p) => p.trim()).filter((p) => p !== "");
        break;
      case "--port":
        args.port = parsePort(value) ?? args.port;
        break;
      case "--record":
        args.record = value.trim();
        break;
      case "--ui-port":
        args.uiPort = parsePort(value) ?? args.uiPort;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }
  return args;
}

function splitFlag(arg: string): [string, string?] {
  const eq = arg.indexOf("=");
  return eq === -1 ? [arg] : [arg.slice(0, eq), arg.slice(eq + 1)];
}

function parsePort(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}
