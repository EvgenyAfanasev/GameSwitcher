import { describe, expect, test } from "bun:test";
import { defaultStore, migrateStore, parseStore, serializeStore, StoreError } from "./store";
import { createMode } from "./store-ops";
import { fakeIds } from "./test-helpers";

describe("store parse/serialize", () => {
  test("round-trip: serialize → parse возвращает эквивалентный стор", () => {
    let store = defaultStore();
    store = createMode(store, "Eco", "#4ade80", fakeIds());
    expect(parseStore(serializeStore(store))).toEqual(store);
  });

  test("битый JSON — StoreError", () => {
    expect(() => parseStore("{not json")).toThrow(StoreError);
  });

  test("нарушение инвариантов при парсинге — StoreError", () => {
    const store = defaultStore();
    store.activeModeId = "missing";
    expect(() => parseStore(serializeStore(store))).toThrow(/invariants/);
  });

  test("миграция v0 (старый стор без полей) → v1 с дефолтами", () => {
    const legacy = JSON.stringify({ modes: [] });
    const migrated = parseStore(legacy);
    expect(migrated.version).toBe(1);
    expect(migrated.settings).toEqual({ autostart: false });
    expect(migrated.games).toEqual([]);
  });

  test("миграция версией выше поддерживаемой — StoreError", () => {
    expect(() => parseStore(JSON.stringify({ version: 99 }))).toThrow(/unsupported store schema/);
  });

  test("migrateStore напрямую", () => {
    expect(migrateStore({}).version).toBe(1);
  });
});
