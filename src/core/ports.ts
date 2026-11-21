export interface StatInfo {
  size: number;
  isDirectory: boolean;
}

export interface FsAdapter {
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<StatInfo>;
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
  mkdirp(path: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  writeFileBytes(path: string, data: Uint8Array): Promise<void>;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ProcAdapter {
  exec(cmd: string, args: string[]): Promise<ExecResult>;
}

export interface Hasher {
  sha256(data: Uint8Array): string;
}

export interface Clock {
  now(): number;
}

export interface IdGen {
  next(prefix: string): string;
}
