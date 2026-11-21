import type { Game, GameProfile } from "../shared/types";

/**
 * Правило эффективного профиля (спека §5):
 * 1. override на конкретный профиль игры
 * 2. иначе связанный профиль активного режима
 * 3. иначе null — запуск без изменений
 */
export function resolveEffectiveProfile(game: Game, activeModeId: string | null): GameProfile | null {
  if (game.overrideProfileId !== null) {
    const p = game.profiles.find((c) => c.id === game.overrideProfileId);
    if (p) return p;
  }
  if (activeModeId !== null) {
    const p = game.profiles.find((c) => c.modeId === activeModeId);
    if (p) return p;
  }
  return null;
}
