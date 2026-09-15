import type { Fleet } from "../state.ts";
import { PAGE } from "./page.ts";

export interface UiContext {
  fleet: Fleet;
  version: string;
  udpPort: number;
  targets: () => string[];
  self: () => { number: string | null; hostname: string };
  setNumber: (value: string) => string;
}

export const UI_PORT_ATTEMPTS = 10;

export function startUi(ctx: UiContext, firstPort: number): number {
  for (let port = firstPort; port < firstPort + UI_PORT_ATTEMPTS; port++) {
    try {
      Deno.serve(
        { hostname: "127.0.0.1", port, onListen: () => {} },
        (req) => handle(req, ctx, port),
      );
      return port;
    } catch (err) {
      if (!(err instanceof Deno.errors.AddrInUse)) throw err;
    }
  }
  throw new Error(
    `no free port for the UI between ${firstPort} and ${firstPort + UI_PORT_ATTEMPTS - 1}`,
  );
}

async function handle(req: Request, ctx: UiContext, uiPort: number): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === "/") {
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (path === "/api/state") {
    const self = ctx.self();
    return json({
      version: ctx.version,
      udpPort: ctx.udpPort,
      uiPort,
      targets: ctx.targets(),
      self,
      needsNumber: self.number === null,
      machines: ctx.fleet.snapshot(),
      historyCount: ctx.fleet.history.length,
    });
  }
  if (path === "/api/history") {
    return json(ctx.fleet.history);
  }
  if (path === "/api/number" && req.method === "POST") {
    try {
      const body: unknown = await req.json();
      const value = typeof body === "object" && body !== null && "number" in body
        ? body.number
        : null;
      if (typeof value !== "string") return json({ ok: false, error: "numero mancante" }, 400);
      return json({ ok: true, path: ctx.setNumber(value) });
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
    }
  }
  return new Response("not found", { status: 404 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function openBrowser(url: string): Promise<void> {
  const [cmd, args] = Deno.build.os === "windows"
    ? ["cmd", ["/c", "start", "", url]]
    : Deno.build.os === "darwin"
    ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    await new Deno.Command(cmd, { args, stdin: "null", stdout: "null", stderr: "null" }).output();
  } catch {
    console.log(`apri il browser su ${url}`);
  }
}
