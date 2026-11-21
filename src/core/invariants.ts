import type { Store } from "../shared/types";

/** Список нарушений инвариантов; пустой массив = валидно. */
export function validateStore(store: Store): string[] {
  const v: string[] = [];
  const modeIds = new Set<string>();
  for (const m of store.modes) {
    if (modeIds.has(m.id)) v.push(`duplicate mode id: ${m.id}`);
    modeIds.add(m.id);
    if (!m.name.trim()) v.push(`mode ${m.id}: empty name`);
  }
  if (store.activeModeId !== null && !modeIds.has(store.activeModeId)) {
    v.push(`activeModeId references missing mode: ${store.activeModeId}`);
  }

  const gameIds = new Set<string>();
  for (const game of store.games) {
    if (gameIds.has(game.id)) v.push(`duplicate game id: ${game.id}`);
    gameIds.add(game.id);

    const profileIds = new Set<string>();
    const linkedModes = new Set<string>();
    const privateNames = new Set<string>();
    for (const p of game.profiles) {
      if (profileIds.has(p.id)) v.push(`game ${game.id}: duplicate profile id: ${p.id}`);
      profileIds.add(p.id);

      if (p.modeId !== null) {
        if (!modeIds.has(p.modeId)) {
          v.push(`game ${game.id}: profile ${p.id} references missing mode: ${p.modeId}`);
        }
        if (linkedModes.has(p.modeId)) {
          v.push(`game ${game.id}: more than one profile linked to mode ${p.modeId}`);
        }
        linkedModes.add(p.modeId);
      } else {
        if (privateNames.has(p.name)) {
          v.push(`game ${game.id}: duplicate private profile name: ${p.name}`);
        }
        privateNames.add(p.name);
      }
      if (!p.name.trim()) v.push(`game ${game.id}: profile ${p.id} has empty name`);
    }

    if (
      game.overrideProfileId !== null &&
      !game.profiles.some((p) => p.id === game.overrideProfileId)
    ) {
      v.push(`game ${game.id}: overrideProfileId references missing profile: ${game.overrideProfileId}`);
    }
  }
  return v;
}
