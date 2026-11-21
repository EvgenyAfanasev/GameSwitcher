export const STORE_SCHEMA_VERSION = 1;

export type TargetType = "file" | "folder" | "registry";

export interface FileTarget {
  type: "file";
  path: string;
}

export interface FolderTarget {
  type: "folder";
  path: string;
}

export interface RegistryTarget {
  type: "registry";
  key: string;
}

export type ConfigTarget = FileTarget | FolderTarget | RegistryTarget;

export interface SnapshotFileEntry {
  targetIndex: number;
  relPath: string;
  size: number;
  hash: string;
}

export interface SnapshotRegistryEntry {
  targetIndex: number;
  file: string;
}

export interface Snapshot {
  files: SnapshotFileEntry[];
  registry: SnapshotRegistryEntry[];
  totalSize: number;
}

export interface GameProfile {
  id: string;
  name: string;
  /** null = частный профиль игры */
  modeId: string | null;
  createdAt: number;
  snapshot: Snapshot;
}

export interface Game {
  id: string;
  name: string;
  exePath: string;
  steamAppId: string | null;
  iconPath: string | null;
  /** конкретный профиль игры в обход глобального режима */
  overrideProfileId: string | null;
  configTargets: ConfigTarget[];
  profiles: GameProfile[];
}

export interface Mode {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Settings {
  autostart: boolean;
}

export interface Store {
  version: number;
  settings: Settings;
  activeModeId: string | null;
  modes: Mode[];
  games: Game[];
}

export interface SkippedEntry {
  targetIndex: number;
  path: string;
}

export interface TakeFilesResult {
  snapshot: Snapshot;
  skipped: SkippedEntry[];
}

export interface ApplyResult {
  restored: number;
  imported: number;
  errors: string[];
}
