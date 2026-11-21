import type { RPCSchema } from "electrobun/main";
import type { ConfigTarget, Game, Snapshot, Store } from "./types";
import type { ProbeResult } from "../core/scanner";

export type R<T> = { ok: true; data: T } | { ok: false; error: string };

export type GamePatch = Partial<Pick<Game, "name" | "exePath" | "steamAppId" | "iconPath" | "configTargets">>;

export interface SnapshotTakeResult {
  store: Store;
  skipped: { targetIndex: number; path: string }[];
  errors: string[];
}

export interface MeasureResult {
  totalSize: number;
  warnings: { targetIndex: number; path: string }[];
  rejected: { targetIndex: number; path: string }[];
  missing: { targetIndex: number; path: string }[];
}

export interface ApplySnapshotResult {
  restored: number;
  imported: number;
  errors: string[];
}

export type GS_RPC = {
  bun: RPCSchema<{
    requests: {
      getState: { params: {}; response: R<Store> };
      createMode: { params: { name: string; color: string }; response: R<Store> };
      renameMode: { params: { modeId: string; name: string }; response: R<Store> };
      deleteMode: { params: { modeId: string }; response: R<Store> };
      setActiveMode: { params: { modeId: string | null }; response: R<Store> };
      addGame: {
        params: { name: string; exePath: string; steamAppId: string | null; iconPath: string | null; configTargets: ConfigTarget[] };
        response: R<Store>;
      };
      updateGame: { params: { gameId: string; patch: GamePatch }; response: R<Store> };
      deleteGame: { params: { gameId: string }; response: R<Store> };
      probe: { params: { exePath: string }; response: R<ProbeResult> };
      measureTargets: { params: { targets: ConfigTarget[] }; response: R<MeasureResult> };
      takeLinkedProfile: {
        params: { gameId: string; modeId: string; name?: string };
        response: R<SnapshotTakeResult>;
      };
      replaceLinkedProfile: {
        params: { gameId: string; profileId: string };
        response: R<SnapshotTakeResult>;
      };
      addPrivateProfile: {
        params: { gameId: string; name: string; targets: ConfigTarget[] };
        response: R<SnapshotTakeResult>;
      };
      setOverride: { params: { gameId: string; profileId: string | null }; response: R<Store> };
      deleteProfile: { params: { gameId: string; profileId: string }; response: R<Store> };
      launchGame: { params: { gameId: string }; response: R<{ launched: boolean }> };
      pickExe: { params: {}; response: string | null };
      pickFolder: { params: {}; response: string | null };
      pickFile: { params: {}; response: string | null };
      setAutostart: { params: { enabled: boolean }; response: R<Store> };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};

export type GSStore = Snapshot;
