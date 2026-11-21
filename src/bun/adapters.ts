import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import fsPromises from "node:fs/promises";
import type { FsAdapter, Hasher, ProcAdapter, StatInfo } from "../core/ports";
import type { Ids } from "../core/store-ops";

export const nodeFs: FsAdapter = {
  async exists(path) {
    return existsSync(path);
  },
  async stat(path): Promise<StatInfo> {
    const st = await fsPromises.stat(path);
    return { size: st.size, isDirectory: st.isDirectory() };
  },
  async readdir(path) {
    return fsPromises.readdir(path);
  },
  async readFile(path) {
    const buf = await fsPromises.readFile(path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  async mkdirp(path) {
    await fsPromises.mkdir(path, { recursive: true });
  },
  async copyFile(from, to) {
    await fsPromises.copyFile(from, to);
  },
  async writeFileBytes(path, data) {
    await fsPromises.writeFile(path, data);
  },
};

export const bunProc: ProcAdapter = {
  async exec(cmd, args) {
    try {
      const proc = Bun.spawn([cmd, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const code = await proc.exited;
      return { code, stdout, stderr };
    } catch (e) {
      return { code: -1, stdout: "", stderr: String(e) };
    }
  },
};

export const sha256Hasher: Hasher = {
  sha256(data) {
    return createHash("sha256").update(data).digest("hex");
  },
};

export function makeIds(): Ids {
  let counter = 0;
  return {
    next(prefix: string) {
      counter = (counter + 1) % 1e9;
      return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
    },
    now() {
      return Date.now();
    },
  };
}

export function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}
