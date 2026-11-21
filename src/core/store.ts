import type { Store } from "../shared/types";
import { STORE_SCHEMA_VERSION } from "../shared/types";
import { validateStore } from "./invariants";

export class StoreError extends Error {}

export function defaultStore(): Store {
  return {
    version: STORE_SCHEMA_VERSION,
    settings: { autostart: false },
    activeModeId: null,
    modes: [],
    games: [],
  };
}

/** Парсинг + миграции + валидация инвариантов. Бросает StoreError. */
export function parseStore(raw: string): Store {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new StoreError(`store.json is not valid JSON: ${e}`);
  }
  const migrated = migrateStore(parsed);
  const violations = validateStore(migrated);
  if (violations.length > 0) {
    throw new StoreError(`store invariants violated: ${violations.join("; ")}`);
  }
  return migrated;
}

export function serializeStore(store: Store): string {
  return JSON.stringify({ ...store, version: STORE_SCHEMA_VERSION }, null, 2);
}

/** Пошаговые миграции вверх до текущей версии схемы. */
export function migrateStore(parsed: unknown): Store {
  if (parsed === null || typeof parsed !== "object") {
    throw new StoreError("store.json root is not an object");
  }
  let s = parsed as Record<string, unknown>;
  let version = typeof s.version === "number" ? s.version : 0;

  if (version < 1) {
    s = {
      version: 1,
      settings: s.settings ?? { autostart: false },
      activeModeId: s.activeModeId ?? null,
      modes: Array.isArray(s.modes) ? s.modes : [],
      games: Array.isArray(s.games) ? s.games : [],
    };
    version = 1;
  }

  if (version !== STORE_SCHEMA_VERSION) {
    throw new StoreError(`unsupported store schema version: ${version}`);
  }
  return s as unknown as Store;
}
