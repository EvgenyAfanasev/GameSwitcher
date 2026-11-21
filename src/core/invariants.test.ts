import { describe, expect, test } from "bun:test";
import { validateStore } from "./invariants";
import { defaultStore } from "./store";
import type { Game, Mode, Snapshot } from "../shared/types";

const snapshot = (): Snapshot => ({ files: [], registry: [], totalSize: 0 });

const game = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  name: "Test",
  exePath: "C:\\t.exe",
  steamAppId: null,
  iconPath: null,
  overrideProfileId: null,
  configTargets: [],
  profiles: [],
  ...overrides,
});

const mode = (id: string, name = id): Mode => ({ id, name, color: "#4ade80", createdAt: 1 });

describe("validateStore", () => {
  test("пустой сторе валиден", () => {
    expect(validateStore(defaultStore())).toEqual([]);
  });

  test("корректный стор валиден", () => {
    const store = defaultStore();
    store.modes = [mode("m1"), mode("m2")];
    store.activeModeId = "m1";
    store.games = [
      game({
        overrideProfileId: "p1",
        profiles: [
          { id: "p1", name: "Eco", modeId: "m1", createdAt: 1, snapshot: snapshot() },
          { id: "p2", name: "Частный", modeId: null, createdAt: 2, snapshot: snapshot() },
        ],
      }),
    ];
    expect(validateStore(store)).toEqual([]);
  });

  test("dangling activeModeId", () => {
    const store = defaultStore();
    store.activeModeId = "missing";
    expect(validateStore(store)).toContainEqual(expect.stringContaining("activeModeId"));
  });

  test("два профиля на один режим — нарушение", () => {
    const store = defaultStore();
    store.modes = [mode("m1")];
    store.games = [
      game({
        profiles: [
          { id: "p1", name: "A", modeId: "m1", createdAt: 1, snapshot: snapshot() },
          { id: "p2", name: "B", modeId: "m1", createdAt: 2, snapshot: snapshot() },
        ],
      }),
    ];
    expect(validateStore(store).join(" ")).toContain("more than one profile linked to mode m1");
  });

  test("dangling overrideProfileId — нарушение", () => {
    const store = defaultStore();
    store.games = [game({ overrideProfileId: "gone" })];
    expect(validateStore(store).join(" ")).toContain("overrideProfileId");
  });

  test("дубли имён частных профилей — нарушение", () => {
    const store = defaultStore();
    store.games = [
      game({
        profiles: [
          { id: "p1", name: "X", modeId: null, createdAt: 1, snapshot: snapshot() },
          { id: "p2", name: "X", modeId: null, createdAt: 2, snapshot: snapshot() },
        ],
      }),
    ];
    expect(validateStore(store).join(" ")).toContain("duplicate private profile name");
  });

  test("профиль ссылается на несуществующий режим — нарушение", () => {
    const store = defaultStore();
    store.games = [game({ profiles: [{ id: "p1", name: "A", modeId: "gone", createdAt: 1, snapshot: snapshot() }] })];
    expect(validateStore(store).join(" ")).toContain("references missing mode");
  });
});
