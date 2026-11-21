import { BrowserWindow, BrowserView, Utils } from "electrobun/main";
import { join } from "path";
import { existsSync, readFileSync } from "node:fs";
import type { ConfigTarget, Game, Snapshot, Store } from "../shared/types";
import type { GS_RPC, GamePatch } from "../shared/rpc";
import { parseStore, serializeStore, StoreError, defaultStore } from "../core/store";
import * as ops from "../core/store-ops";
import { resolveEffectiveProfile } from "../core/resolve";
import { applyFilesSnapshot, measureTargetFiles, takeFilesSnapshot } from "../core/snapshot-files";
import { applyRegistrySnapshot, takeRegistrySnapshot } from "../core/snapshot-registry";
import { probeForGame, type ProbeResult } from "../core/scanner";
import { basename, dirname, joinPath } from "../core/paths";
import { bunProc, ensureDir, makeIds, nodeFs, sha256Hasher } from "./adapters";

const gen = makeIds();
const dataDir = Utils.paths.userData;
const storePath = join(dataDir, "store.json");
const snapshotsDir = joinPath(dataDir, "snapshots");
const iconsDir = joinPath(dataDir, "icons");
ensureDir(dataDir);
ensureDir(snapshotsDir);
ensureDir(iconsDir);

type R<T> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): R<T> => ({ ok: true, data });
const fail = (e: unknown): R<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

function loadStore(): Store {
  if (!existsSync(storePath)) return defaultStore();
  try {
    return parseStore(readFileSync(storePath, "utf-8"));
  } catch (e) {
    if (e instanceof StoreError) {
      const backup = `${storePath}.corrupt-${Date.now()}`;
      try {
        nodeFs.copyFile(storePath, backup);
      } catch {
        /* бэкап не критичен */
      }
      return defaultStore();
    }
    throw e;
  }
}

async function saveStore(store: Store): Promise<void> {
  await Bun.write(storePath, serializeStore(store));
}

/** Мутация: load → op → validate (внутри op) → save. Возвращает новый стор или fail. */
async function withStore<T>(mutate: (store: Store) => Store, pick: (store: Store) => T): Promise<R<T>> {
  try {
    const next = mutate(loadStore());
    await saveStore(next);
    return ok(pick(next));
  } catch (e) {
    return fail(e);
  }
}

interface SnapshotTake {
  snapshot: Snapshot;
  skipped: { targetIndex: number; path: string }[];
  errors: string[];
}

async function takeSnapshotDir(targets: ConfigTarget[], snapshotDir: string): Promise<SnapshotTake> {
  const files = await takeFilesSnapshot(targets, snapshotDir, nodeFs, sha256Hasher);
  const registry = await takeRegistrySnapshot(targets, snapshotDir, bunProc);
  const snapshot: Snapshot = {
    files: files.snapshot.files,
    registry: registry.entries,
    totalSize: files.snapshot.totalSize,
  };
  return { snapshot, skipped: files.skipped, errors: [...registry.errors] };
}

async function checkGameRunning(game: Game): Promise<string | null> {
  const exeBase = basename(game.exePath);
  const res = await bunProc.exec("tasklist", ["/FI", `IMAGENAME eq ${exeBase}`, "/FO", "CSV", "/NH"]);
  if (res.code === 0 && res.stdout.toLowerCase().includes(exeBase.toLowerCase().replace(".exe", ""))) {
    return `Игра уже запущена: ${game.name}. Закройте её перед сменой профиля.`;
  }
  return null;
}

async function applyProfileSnapshot(game: Game, snapshotDir: string, snapshot: Snapshot): Promise<string[]> {
  const files = await applyFilesSnapshot(game.configTargets, snapshotDir, snapshot, nodeFs, sha256Hasher);
  const registry = await applyRegistrySnapshot(snapshot, snapshotDir, bunProc);
  return [...files.errors, ...registry.errors];
}

function launchExe(game: Game): void {
  const exeDir = dirname(game.exePath);
  Bun.spawn([game.exePath], {
    cwd: exeDir || undefined,
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
}

function launchSteam(appId: string): void {
  Bun.spawn(["cmd", "/c", "start", "", `steam://rungameid/${appId}`], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
}

const rpc = BrowserView.defineRPC<GS_RPC>({
  maxRequestTime: 60000,
  handlers: {
    requests: {
      getState: () => ok(loadStore()),
      createMode: ({ name, color }) => withStore((s) => ops.createMode(s, name, color, gen), (s) => s),
      renameMode: ({ modeId, name }) => withStore((s) => ops.renameMode(s, modeId, name), (s) => s),
      deleteMode: ({ modeId }) => withStore((s) => ops.deleteMode(s, modeId), (s) => s),
      setActiveMode: ({ modeId }) => withStore((s) => ops.setActiveMode(s, modeId), (s) => s),
      addGame: (params) =>
        withStore(
          (s) =>
            ops.createGame(
              s,
              {
                name: params.name,
                exePath: params.exePath,
                steamAppId: params.steamAppId,
                iconPath: params.iconPath,
                configTargets: params.configTargets,
              },
              gen,
            ),
          (s) => s,
        ),
      updateGame: ({ gameId, patch }) => withStore((s) => ops.updateGame(s, gameId, patch), (s) => s),
      deleteGame: ({ gameId }) => withStore((s) => ops.deleteGame(s, gameId), (s) => s),
      probe: async ({ exePath }) => {
        try {
          return ok(await probeForGame(exePath, nodeFs, bunProc, { get: (n) => Bun.env[n] }));
        } catch (e) {
          return fail(e);
        }
      },
      measureTargets: async ({ targets }) => {
        try {
          return ok(await measureTargetFiles(targets, nodeFs));
        } catch (e) {
          return fail(e);
        }
      },
      takeLinkedProfile: async ({ gameId, modeId, name }) => {
        try {
          const store = loadStore();
          const game = ops.findGame(store, gameId);
          const mode = store.modes.find((m) => m.id === modeId);
          if (!mode) return fail(new Error(`Режим не найден: ${modeId}`));
          const profileId = gen.next("p");
          const snapshotDir = joinPath(snapshotsDir, profileId);
          await nodeFs.mkdirp(snapshotDir);
          const take = await takeSnapshotDir(game.configTargets, snapshotDir);
          const next = ops.addLinkedProfile(
            store,
            gameId,
            { name: name?.trim() || mode.name, modeId, snapshot: take.snapshot },
            {
              next: (prefix) => (prefix === "p" ? profileId : gen.next(prefix)),
              now: () => gen.now(),
            },
          );
          await saveStore(next);
          return ok({ store: next, skipped: take.skipped, errors: take.errors });
        } catch (e) {
          return fail(e);
        }
      },
      replaceLinkedProfile: async ({ gameId, profileId }) => {
        try {
          const store = loadStore();
          const game = ops.findGame(store, gameId);
          const profile = game.profiles.find((p) => p.id === profileId);
          if (!profile) return fail(new Error(`Профиль не найден: ${profileId}`));
          if (profile.modeId === null) {
            return fail(new Error("↻ доступен только для профилей, связанных с режимом"));
          }
          const snapshotDir = joinPath(snapshotsDir, profileId);
          await nodeFs.mkdirp(snapshotDir);
          const take = await takeSnapshotDir(game.configTargets, snapshotDir);
          const next = ops.replaceLinkedProfileSnapshot(store, gameId, profile.modeId, take.snapshot, gen);
          await saveStore(next);
          return ok({ store: next, skipped: take.skipped, errors: take.errors });
        } catch (e) {
          return fail(e);
        }
      },
      addPrivateProfile: async ({ gameId, name, targets }) => {
        try {
          const store = loadStore();
          const game = ops.findGame(store, gameId);
          const profileId = gen.next("p");
          const snapshotDir = joinPath(snapshotsDir, profileId);
          await nodeFs.mkdirp(snapshotDir);
          const take = await takeSnapshotDir(targets, snapshotDir);
          const next = ops.addPrivateProfile(
            store,
            gameId,
            { name, snapshot: take.snapshot },
            {
              next: (prefix) => (prefix === "p" ? profileId : gen.next(prefix)),
              now: () => gen.now(),
            },
          );
          await saveStore(next);
          return ok({ store: next, skipped: take.skipped, errors: take.errors });
        } catch (e) {
          return fail(e);
        }
      },
      setOverride: ({ gameId, profileId }) => withStore((s) => ops.setOverride(s, gameId, profileId), (s) => s),
      deleteProfile: ({ gameId, profileId }) => withStore((s) => ops.deleteProfile(s, gameId, profileId), (s) => s),
      launchGame: async ({ gameId }) => {
        try {
          const store = loadStore();
          const game = ops.findGame(store, gameId);
          const running = await checkGameRunning(game);
          if (running) return fail(new Error(running));
          const profile = resolveEffectiveProfile(game, store.activeModeId);
          if (profile) {
            const errors = await applyProfileSnapshot(game, joinPath(snapshotsDir, profile.id), profile.snapshot);
            if (errors.length > 0) {
              return fail(new Error(`Профиль применён с ошибками: ${errors[0]}`));
            }
          }
          if (game.steamAppId) {
            launchSteam(game.steamAppId);
          } else {
            launchExe(game);
          }
          win.minimize();
          return ok({ launched: true });
        } catch (e) {
          return fail(e);
        }
      },
      pickExe: async () => {
        const paths = await Utils.openFileDialog({
          canChooseFiles: true,
          canChooseDirectory: false,
          allowsMultipleSelection: false,
        });
        return paths[0] ?? null;
      },
      pickFolder: async () => {
        const paths = await Utils.openFileDialog({
          canChooseFiles: false,
          canChooseDirectory: true,
          allowsMultipleSelection: false,
        });
        return paths[0] ?? null;
      },
      pickFile: async () => {
        const paths = await Utils.openFileDialog({
          canChooseFiles: true,
          canChooseDirectory: false,
          allowsMultipleSelection: false,
        });
        return paths[0] ?? null;
      },
      setAutostart: ({ enabled }) =>
        withStore(
          (s) => {
            const next = structuredClone(s);
            next.settings.autostart = enabled;
            return next;
          },
          (s) => s,
        ),
    },
    messages: {},
  },
});

const win = new BrowserWindow({
  title: "GameSwitcher",
  url: "views://mainview/index.html",
  rpc,
  frame: {
    width: 900,
    height: 640,
    x: 120,
    y: 120,
  },
});

console.log(`GameSwitcher started, store: ${storePath}`);
void win;
