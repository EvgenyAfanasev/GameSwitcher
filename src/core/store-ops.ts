import type { Game, Mode, Snapshot, Store } from "../shared/types";
import { validateStore } from "./invariants";
import { defaultStore } from "./store";

export class OpError extends Error {}

function withStore(store: Store, mutate: (s: Store) => void): Store {
  const next = structuredClone(store) as Store;
  mutate(next);
  const violations = validateStore(next);
  if (violations.length > 0) {
    throw new OpError(`operation would violate invariants: ${violations.join("; ")}`);
  }
  return next;
}

export function createMode(store: Store, name: string, color: string, gen: Ids): Store {
  const trimmed = name.trim();
  if (!trimmed) throw new OpError("mode name must not be empty");
  return withStore(store, (s) => {
    s.modes.push({ id: gen.next("m"), name: trimmed, color, createdAt: gen.now() });
  });
}

export function renameMode(store: Store, modeId: string, name: string): Store {
  const trimmed = name.trim();
  if (!trimmed) throw new OpError("mode name must not be empty");
  return withStore(store, (s) => {
    const mode = s.modes.find((m) => m.id === modeId);
    if (!mode) throw new OpError(`mode not found: ${modeId}`);
    mode.name = trimmed;
  });
}

/** Удаление режима: связанные профили становятся частными; активный режим переезжает на первый оставшийся. */
export function deleteMode(store: Store, modeId: string): Store {
  return withStore(store, (s) => {
    if (!s.modes.some((m) => m.id === modeId)) throw new OpError(`mode not found: ${modeId}`);
    s.modes = s.modes.filter((m) => m.id !== modeId);
    for (const game of s.games) {
      for (const p of game.profiles) {
        if (p.modeId === modeId) p.modeId = null;
      }
    }
    if (s.activeModeId === modeId) {
      s.activeModeId = s.modes[0]?.id ?? null;
    }
  });
}

export function setActiveMode(store: Store, modeId: string | null): Store {
  return withStore(store, (s) => {
    if (modeId !== null && !s.modes.some((m) => m.id === modeId)) {
      throw new OpError(`mode not found: ${modeId}`);
    }
    s.activeModeId = modeId;
  });
}

export function createGame(
  store: Store,
  data: {
    name: string;
    exePath: string;
    steamAppId: string | null;
    iconPath: string | null;
    configTargets: Game["configTargets"];
  },
  gen: Ids,
): Store {
  const name = data.name.trim();
  if (!name) throw new OpError("game name must not be empty");
  if (!data.exePath.trim()) throw new OpError("exePath must not be empty");
  return withStore(store, (s) => {
    s.games.push({
      id: gen.next("g"),
      name,
      exePath: data.exePath,
      steamAppId: data.steamAppId,
      iconPath: data.iconPath,
      overrideProfileId: null,
      configTargets: structuredClone(data.configTargets),
      profiles: [],
    });
  });
}

export function updateGame(
  store: Store,
  gameId: string,
  patch: Partial<Pick<Game, "name" | "exePath" | "steamAppId" | "iconPath" | "configTargets">>,
): Store {
  return withStore(store, (s) => {
    const game = findGame(s, gameId);
    if (patch.name !== undefined && !patch.name.trim()) throw new OpError("game name must not be empty");
    Object.assign(game, structuredClone(patch));
  });
}

export function deleteGame(store: Store, gameId: string): Store {
  return withStore(store, (s) => {
    findGame(s, gameId);
    s.games = s.games.filter((g) => g.id !== gameId);
  });
}

/** Сохранить профиль в слот режима. Слот занят — ошибка (использовать replaceLinkedProfileSnapshot). */
export function addLinkedProfile(
  store: Store,
  gameId: string,
  data: { name: string; modeId: string; snapshot: Snapshot },
  gen: Ids,
): Store {
  const name = data.name.trim();
  if (!name) throw new OpError("profile name must not be empty");
  return withStore(store, (s) => {
    const game = findGame(s, gameId);
    if (!s.modes.some((m) => m.id === data.modeId)) throw new OpError(`mode not found: ${data.modeId}`);
    if (game.profiles.some((p) => p.modeId === data.modeId)) {
      throw new OpError(`slot already taken for mode ${data.modeId}: use replace`);
    }
    pushProfile(game, { name, modeId: data.modeId, snapshot: data.snapshot }, gen, () => gen.next("p"));
  });
}

/** ↻ — обновить снапшот связанного профиля поверх старого. */
export function replaceLinkedProfileSnapshot(
  store: Store,
  gameId: string,
  modeId: string,
  snapshot: Snapshot,
  gen: Ids,
): Store {
  return withStore(store, (s) => {
    const game = findGame(s, gameId);
    const profile = game.profiles.find((p) => p.modeId === modeId);
    if (!profile) throw new OpError(`no linked profile for mode ${modeId}`);
    profile.snapshot = snapshot;
    profile.createdAt = gen.now();
  });
}

export function addPrivateProfile(
  store: Store,
  gameId: string,
  data: { name: string; snapshot: Snapshot },
  gen: Ids,
): Store {
  const name = data.name.trim();
  if (!name) throw new OpError("profile name must not be empty");
  return withStore(store, (s) => {
    const game = findGame(s, gameId);
    if (game.profiles.some((p) => p.modeId === null && p.name === name)) {
      throw new OpError(`private profile "${name}" already exists`);
    }
    pushProfile(game, { name, modeId: null, snapshot: data.snapshot }, gen, () => gen.next("p"));
  });
}

/** Override на конкретный профиль игры; null = следовать глобальному. */
export function setOverride(store: Store, gameId: string, profileId: string | null): Store {
  return withStore(store, (s) => {
    const game = findGame(s, gameId);
    if (profileId !== null && !game.profiles.some((p) => p.id === profileId)) {
      throw new OpError(`profile not found: ${profileId}`);
    }
    game.overrideProfileId = profileId;
  });
}

export function deleteProfile(store: Store, gameId: string, profileId: string): Store {
  return withStore(store, (s) => {
    const game = findGame(s, gameId);
    if (!game.profiles.some((p) => p.id === profileId)) {
      throw new OpError(`profile not found: ${profileId}`);
    }
    game.profiles = game.profiles.filter((p) => p.id !== profileId);
    if (game.overrideProfileId === profileId) game.overrideProfileId = null;
  });
}

export function findGame(store: Store, gameId: string): Game {
  const game = store.games.find((g) => g.id === gameId);
  if (!game) throw new OpError(`game not found: ${gameId}`);
  return game;
}

function pushProfile(
  game: Game,
  data: { name: string; modeId: string | null; snapshot: Snapshot },
  gen: Ids,
  id: () => string,
): void {
  game.profiles.push({ id: id(), name: data.name, modeId: data.modeId, createdAt: gen.now(), snapshot: data.snapshot });
}

export interface Ids {
  next(prefix: string): string;
  now(): number;
}
