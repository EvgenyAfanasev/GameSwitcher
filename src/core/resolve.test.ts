import { describe, expect, test } from "bun:test";
import { resolveEffectiveProfile } from "./resolve";
import type { Game, GameProfile, Snapshot } from "../shared/types";

const emptySnapshot = (): Snapshot => ({ files: [], registry: [], totalSize: 0 });

const profile = (id: string, modeId: string | null, name = id): GameProfile => ({
  id,
  name,
  modeId,
  createdAt: 1,
  snapshot: emptySnapshot(),
});

const game = (overrides: Partial<Game> = {}): Game => ({
  id: "g1",
  name: "Test",
  exePath: "C:\\Games\\test.exe",
  steamAppId: null,
  iconPath: null,
  overrideProfileId: null,
  configTargets: [],
  profiles: [profile("p_eco", "m_eco", "Eco"), profile("p_perf", "m_perf", "Performance"), profile("p_priv", null, "Частный")],
  ...overrides,
});

describe("resolveEffectiveProfile", () => {
  test("без override — связанный профиль активного режима", () => {
    expect(resolveEffectiveProfile(game(), "m_perf")?.id).toBe("p_perf");
    expect(resolveEffectiveProfile(game(), "m_eco")?.id).toBe("p_eco");
  });

  test("частные профили никогда не выбираются глобальным режимом", () => {
    expect(resolveEffectiveProfile(game(), null)?.id).toBeUndefined();
  });

  test("override сильнее активного режима", () => {
    expect(resolveEffectiveProfile(game({ overrideProfileId: "p_priv" }), "m_perf")?.id).toBe("p_priv");
  });

  test("dangling override молча игнорируется, падаем в режим", () => {
    expect(resolveEffectiveProfile(game({ overrideProfileId: "gone" }), "m_eco")?.id).toBe("p_eco");
  });

  test("нет режима или нет связанного профиля — null («как есть»)", () => {
    expect(resolveEffectiveProfile(game(), null)).toBeNull();
    expect(resolveEffectiveProfile(game(), "m_missing")).toBeNull();
  });
});
