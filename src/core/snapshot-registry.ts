import type { ApplyResult, ConfigTarget, Snapshot, SnapshotRegistryEntry } from "../shared/types";
import type { ProcAdapter } from "./ports";
import { joinPath } from "./paths";

/**
 * Реестр через штатный reg.exe: снапшот = `reg export`, применение = `reg import` (спека §6.2).
 * Пути с "/" внутри core; конвертацию в backslash делает proc-адаптер на Windows.
 */
export async function takeRegistrySnapshot(
  targets: ConfigTarget[],
  snapshotDir: string,
  proc: ProcAdapter,
): Promise<{ entries: SnapshotRegistryEntry[]; errors: string[] }> {
  const entries: SnapshotRegistryEntry[] = [];
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (target.type !== "registry") continue;
    const file = `registry/${i}.reg`;
    const abs = joinPath(snapshotDir, file);
    const res = await proc.exec("reg", ["export", target.key, abs, "/y"]);
    if (res.code !== 0) {
      errors.push(`reg export failed for ${target.key}: ${res.stderr.trim() || res.stdout.trim()}`);
      continue;
    }
    entries.push({ targetIndex: i, file });
  }

  return { entries, errors };
}

export async function applyRegistrySnapshot(
  snapshot: Snapshot,
  snapshotDir: string,
  proc: ProcAdapter,
): Promise<ApplyResult> {
  const errors: string[] = [];
  let imported = 0;

  for (const entry of snapshot.registry) {
    const abs = joinPath(snapshotDir, entry.file);
    const res = await proc.exec("reg", ["import", abs]);
    if (res.code !== 0) {
      errors.push(`reg import failed for ${abs}: ${res.stderr.trim() || res.stdout.trim()}`);
      continue;
    }
    imported++;
  }

  return { restored: 0, imported, errors };
}
