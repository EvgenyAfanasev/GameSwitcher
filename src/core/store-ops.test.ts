import { describe, expect, test } from "bun:test";
import {
  addLinkedProfile,
  addPrivateProfile,
  createGame,
  createMode,
  deleteGame,
  deleteMode,
  deleteProfile,
  findGame,
  replaceLinkedProfileSnapshot,
  setActiveMode,
  setOverride,
  OpError,
} from "./store-ops";
import { defaultStore } from "./store";
import { fakeIds } from "./test-helpers";
import type { Snapshot, Store } from "../shared/types";

const snap = (n = 0): Snapshot => ({ files: [], registry: [], totalSize: n });

function seeded(): Store {
  let store = defaultStore();
  store = createMode(store, "Eco", "#4ade80", fakeIds());
  store = createMode(store, "Performance", "#f87171", fakeIds(10));
  return store;
}

describe("modes", () => {
  test("createMode добавляет режим", () => {
    const store = seeded();
    expect(store.modes.map((m) => m.name)).toEqual(["Eco", "Performance"]);
  });

  test("deleteMode переводит связанные профили в частные", () => {
    let store = seeded();
    store = createGame(
      store,
      { name: "Zelda", exePath: "C:\\z.exe", steamAppId: null, iconPath: null, configTargets: [] },
      fakeIds(20),
    );
    const gid = store.games[0].id;
    store = addLinkedProfile(store, gid, { name: "Eco", modeId: store.modes[0].id, snapshot: snap() }, fakeIds(30));
    const ecoModeId = store.modes[0].id;
    store = deleteMode(store, ecoModeId);
    expect(store.modes.map((m) => m.id)).not.toContain(ecoModeId);
    const profile = findGame(store, gid).profiles[0];
    expect(profile.modeId).toBeNull();
    expect(profile.name).toBe("Eco");
  });

  test("удаление активного режима переносит activeModeId на первый оставшийся", () => {
    let store = seeded();
    const first = store.modes[0].id;
    store = setActiveMode(store, first);
    store = deleteMode(store, first);
    expect(store.activeModeId).toBe(store.modes[0]?.id ?? null);
  });

  test("setActiveMode на несуществующий режим — OpError", () => {
    expect(() => setActiveMode(seeded(), "nope")).toThrow(OpError);
  });
});

describe("games and profiles", () => {
  function withGame(): Store {
    let store = seeded();
    store = createGame(
      store,
      { name: "Zelda", exePath: "C:\\z.exe", steamAppId: null, iconPath: null, configTargets: [] },
      fakeIds(20),
    );
    return store;
  }

  test("addLinkedProfile занимает слот режима; повтор — OpError", () => {
    let store = withGame();
    const gid = store.games[0].id;
    const modeId = store.modes[0].id;
    store = addLinkedProfile(store, gid, { name: "Eco", modeId, snapshot: snap() }, fakeIds(30));
    expect(() => addLinkedProfile(store, gid, { name: "Eco 2", modeId, snapshot: snap() }, fakeIds(40))).toThrow(
      /slot already taken/,
    );
  });

  test("replaceLinkedProfileSnapshot обновляет снапшот того же профиля (↻)", () => {
    let store = withGame();
    const gid = store.games[0].id;
    const modeId = store.modes[0].id;
    store = addLinkedProfile(store, gid, { name: "Eco", modeId, snapshot: snap(1) }, fakeIds(30));
    const pid = findGame(store, gid).profiles[0].id;
    store = replaceLinkedProfileSnapshot(store, gid, modeId, snap(2), fakeIds(40));
    const profile = findGame(store, gid).profiles[0];
    expect(profile.id).toBe(pid);
    expect(profile.snapshot.totalSize).toBe(2);
  });

  test("частные профили: дубликат имени — OpError", () => {
    let store = withGame();
    const gid = store.games[0].id;
    store = addPrivateProfile(store, gid, { name: "Поездка", snapshot: snap() }, fakeIds(30));
    expect(() => addPrivateProfile(store, gid, { name: "Поездка", snapshot: snap() }, fakeIds(40))).toThrow(
      /already exists/,
    );
  });

  test("deleteProfile обнуляет override на удалённый профиль", () => {
    let store = withGame();
    const gid = store.games[0].id;
    store = addPrivateProfile(store, gid, { name: "Поездка", snapshot: snap() }, fakeIds(30));
    const pid = findGame(store, gid).profiles[0].id;
    store = setOverride(store, gid, pid);
    store = deleteProfile(store, gid, pid);
    expect(findGame(store, gid).overrideProfileId).toBeNull();
  });

  test("операции не мутируют исходный стор (иммутабельность)", () => {
    let store = withGame();
    const gid = store.games[0].id;
    const frozen = JSON.parse(JSON.stringify(store)) as Store;
    store = addLinkedProfile(store, gid, { name: "Eco", modeId: store.modes[0].id, snapshot: snap() }, fakeIds(30));
    store = setOverride(store, gid, store.games[0].profiles[0].id);
    expect(store.games[0].profiles).toHaveLength(1);
    expect(frozen.games[0].profiles).toHaveLength(0);
    expect(frozen.games[0].overrideProfileId).toBeNull();
  });

  test("deleteGame удаляет игру", () => {
    let store = withGame();
    const gid = store.games[0].id;
    store = deleteGame(store, gid);
    expect(store.games).toHaveLength(0);
  });
});
