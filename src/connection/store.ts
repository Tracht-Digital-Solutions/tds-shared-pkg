import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { PairableSiteProfile, SiteConnection } from "./types.js";

export interface ConnectionStoreOptions {
  profile: PairableSiteProfile;
  /** Passenger application root. Defaults to `process.cwd()`. */
  root?: string;
  /** Base state directory. The profile is appended to it. */
  stateDir?: string;
  /** Environment seam for tests. */
  env?: NodeJS.ProcessEnv;
}

const PROFILE = /^(blog|landingpage|tools)$/;

function cleanBase(value: string, root: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(root, value);
}

/**
 * Resolve a directory outside the application checkout by default.
 *
 * A release replaces the application directory. Keeping the credential one
 * level above it means a deploy can neither publish nor remove it.
 */
export function resolveConnectionDirectory(options: ConnectionStoreOptions): string {
  if (!PROFILE.test(options.profile)) throw new Error("invalid_connection_profile");
  const root = resolve(options.root ?? process.cwd());
  const env = options.env ?? process.env;
  const configured = (options.stateDir ?? env.TDS_STATE_DIR ?? "").trim();
  const base = configured === "" ? resolve(root, "..", ".tds-state") : cleanBase(configured, root);
  return resolve(base, options.profile);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pureHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function parseConnection(value: unknown, profile: PairableSiteProfile): SiteConnection | null {
  if (!isPlainObject(value) || value.version !== 1 || value.profile !== profile) return null;
  const origin = pureHttpsOrigin(value.origin);
  const apiBase = pureHttpsOrigin(value.apiBase);
  if (!origin || !apiBase) return null;
  if (typeof value.siteKey !== "string" || value.siteKey.trim() === "") return null;
  if (typeof value.cacheToken !== "string" || value.cacheToken.trim() === "") return null;
  if (typeof value.pairingId !== "string" || value.pairingId.trim() === "") return null;
  if (typeof value.connectedAt !== "string" || !Number.isFinite(Date.parse(value.connectedAt))) return null;
  if (!isPlainObject(value.resource) || typeof value.resource.type !== "string") return null;
  if (typeof value.resource.id !== "string" && typeof value.resource.id !== "number") return null;
  if (!isPlainObject(value.runtime)) return null;

  return {
    version: 1,
    profile,
    origin,
    apiBase,
    siteKey: value.siteKey,
    cacheToken: value.cacheToken,
    resource: { type: value.resource.type, id: value.resource.id },
    runtime: value.runtime as SiteConnection["runtime"],
    pairingId: value.pairingId,
    connectedAt: new Date(value.connectedAt).toISOString(),
  };
}

/** File-backed private connection state with atomic, owner-only writes. */
export class ConnectionStore {
  readonly profile: PairableSiteProfile;
  readonly directory: string;
  readonly file: string;

  constructor(options: ConnectionStoreOptions) {
    this.profile = options.profile;
    this.directory = resolveConnectionDirectory(options);
    this.file = resolve(this.directory, "connection.json");
  }

  readSync(): SiteConnection | null {
    try {
      return parseConnection(JSON.parse(readFileSync(this.file, "utf8")), this.profile);
    } catch {
      return null;
    }
  }

  async read(): Promise<SiteConnection | null> {
    try {
      return parseConnection(JSON.parse(await readFile(this.file, "utf8")), this.profile);
    } catch {
      return null;
    }
  }

  writeSync(connection: SiteConnection): void {
    const parsed = parseConnection(connection, this.profile);
    if (!parsed) throw new Error("invalid_connection_state");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(parsed, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      chmodSync(temporary, 0o600);
      renameSync(temporary, this.file);
      chmodSync(this.file, 0o600);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  async write(connection: SiteConnection): Promise<void> {
    const parsed = parseConnection(connection, this.profile);
    if (!parsed) throw new Error("invalid_connection_state");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await chmod(temporary, 0o600);
      await rename(temporary, this.file);
      await chmod(this.file, 0o600);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async remove(): Promise<void> {
    await rm(this.file, { force: true });
  }
}

