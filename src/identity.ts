export const NUMBER_FILE = "pc-number.txt";
export const PEERS_FILE = "peers.txt";
const APP_DIR = "pc-health-broadcaster";
const NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

export function isValidNumber(value: string): boolean {
  return NUMBER_PATTERN.test(value);
}

export function isCompiled(): boolean {
  const exe = Deno.execPath().replaceAll("\\", "/").split("/").pop() ?? "";
  return exe !== "deno" && exe !== "deno.exe";
}

export function exeDir(): string {
  if (!isCompiled()) return Deno.cwd();
  const path = Deno.execPath();
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut === -1 ? Deno.cwd() : path.slice(0, cut);
}

export function configDir(): string | null {
  const env = Deno.env;
  if (Deno.build.os === "windows") {
    const base = env.get("APPDATA");
    return base ? `${base}\\${APP_DIR}` : null;
  }
  const xdg = env.get("XDG_CONFIG_HOME");
  const home = env.get("HOME");
  const base = xdg ?? (home ? `${home}/.config` : null);
  return base ? `${base}/${APP_DIR}` : null;
}

export function dataDirs(): string[] {
  const dirs = [exeDir()];
  const cfg = configDir();
  if (cfg !== null) dirs.push(cfg);
  return dirs;
}

export function joinPath(dir: string, file: string): string {
  const sep = Deno.build.os === "windows" ? "\\" : "/";
  return `${dir}${sep}${file}`;
}

function readFirst(file: string): string | null {
  for (const dir of dataDirs()) {
    try {
      return Deno.readTextFileSync(joinPath(dir, file));
    } catch {
      continue;
    }
  }
  return null;
}

export function readNumber(): string | null {
  const value = readFirst(NUMBER_FILE)?.trim() ?? "";
  return isValidNumber(value) ? value : null;
}

export function writeNumber(value: string): string {
  if (!isValidNumber(value)) throw new Error(`invalid PC number: ${value}`);
  let lastError: unknown = null;
  for (const dir of dataDirs()) {
    try {
      Deno.mkdirSync(dir, { recursive: true });
      const path = joinPath(dir, NUMBER_FILE);
      Deno.writeTextFileSync(path, `${value}\n`);
      return path;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`cannot write ${NUMBER_FILE}: ${String(lastError)}`);
}

export function readPeersFile(): string[] {
  const text = readFirst(PEERS_FILE) ?? "";
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line !== "");
}
