import { createHash } from "node:crypto";
import type { FsAdapter, Hasher } from "./ports";
import type { Ids } from "./store-ops";

export function realHasher(): Hasher {
  return {
    sha256(data: Uint8Array): string {
      return createHash("sha256").update(data).digest("hex");
    },
  };
}

export function fakeIds(seed = 0): Ids {
  let n = seed;
  let t = 1_000_000;
  return {
    next(prefix: string): string {
      return `${prefix}_${n++}`;
    },
    now(): number {
      return t++;
    },
  };
}

type MemEntry = { kind: "file"; data: Uint8Array } | { kind: "dir" };

export class MemFs implements FsAdapter {
  private entries = new Map<string, MemEntry>();

  static fromFiles(files: Record<string, string | Uint8Array>): MemFs {
    const fs = new MemFs();
    for (const [path, content] of Object.entries(files)) {
      const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
      fs.putFile(path, data);
    }
    return fs;
  }

  putFile(path: string, data: string | Uint8Array): void {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    this.mkdirpSync(dirnameOf(path));
    this.entries.set(norm(path), { kind: "file", data: bytes });
  }

  putDir(path: string): void {
    this.mkdirpSync(path);
  }

  clone(): MemFs {
    const copy = new MemFs();
    for (const [key, entry] of this.entries) {
      copy.entries.set(key, entry.kind === "dir" ? entry : { kind: "file", data: entry.data.slice() });
    }
    return copy;
  }

  async exists(path: string): Promise<boolean> {
    return this.entries.has(norm(path));
  }

  async stat(path: string): Promise<{ size: number; isDirectory: boolean }> {
    const e = this.entries.get(norm(path));
    if (!e) throw new Error(`not found: ${path}`);
    return e.kind === "dir" ? { size: 0, isDirectory: true } : { size: e.data.byteLength, isDirectory: false };
  }

  async readdir(path: string): Promise<string[]> {
    const prefix = norm(path) + "/";
    const names = new Set<string>();
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      names.add(rest.split("/")[0]);
    }
    return [...names];
  }

  async readFile(path: string): Promise<Uint8Array> {
    const e = this.entries.get(norm(path));
    if (!e || e.kind !== "file") throw new Error(`not a file: ${path}`);
    return e.data;
  }

  async mkdirp(path: string): Promise<void> {
    this.mkdirpSync(path);
  }

  async copyFile(from: string, to: string): Promise<void> {
    this.putFile(to, await this.readFile(from));
  }

  async writeFileBytes(path: string, data: Uint8Array): Promise<void> {
    this.putFile(path, data);
  }

  private mkdirpSync(path: string): void {
    const parts = norm(path).split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur === "" ? part : `${cur}/${part}`;
      if (!this.entries.has(cur)) this.entries.set(cur, { kind: "dir" });
    }
  }
}

function norm(p: string): string {
  const n = p.replace(/\\/g, "/");
  return n.length > 1 && n.endsWith("/") ? n.slice(0, -1) : n;
}

function dirnameOf(p: string): string {
  const idx = norm(p).lastIndexOf("/");
  return idx === -1 ? "" : norm(p).slice(0, idx);
}

export class FakeProc {
  constructor(private handler: (cmd: string, args: string[]) => { code: number; stdout?: string; stderr?: string }) {}

  async exec(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    const r = this.handler(cmd, args);
    return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }
}

export const envOf = (vars: Record<string, string>) => ({
  get: (name: string) => vars[name],
});
