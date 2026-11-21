import type { ApplyResult, ConfigTarget, Snapshot, SnapshotFileEntry, SkippedEntry, TakeFilesResult } from "../shared/types";
import type { FsAdapter, Hasher } from "./ports";
import { basename, dirname, joinPath } from "./paths";

/** Сегменты, которые никогда не попадают в снапшот (сейвы — порча прогресса при восстановлении). */
const EXCLUDED_SEGMENTS = /^(saves?|savegames?)$/i;

export const WARN_FILE_BYTES = 50 * 1024 * 1024;
export const REJECT_FILE_BYTES = 200 * 1024 * 1024;

export function isExcludedSegment(name: string): boolean {
  return EXCLUDED_SEGMENTS.test(name);
}

interface CollectedFile {
  targetIndex: number;
  relInside: string;
  abs: string;
  size: number;
}

/**
 * Обходит цели (file/folder) и собирает список файлов-кандидатов.
 * registry-цели пропускаются; отсутствующие пути — в skipped.
 * Файлы больше REJECT_FILE_BYTES отклоняются, больше WARN_FILE_BYTES — предупреждение.
 */
export async function collectTargetFiles(
  targets: ConfigTarget[],
  fs: FsAdapter,
): Promise<{ files: CollectedFile[]; skipped: SkippedEntry[] }> {
  const files: CollectedFile[] = [];
  const skipped: SkippedEntry[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (target.type === "registry") continue;
    if (!(await fs.exists(target.path))) {
      skipped.push({ targetIndex: i, path: target.path });
      continue;
    }
    if (target.type === "file") {
      const st = await fs.stat(target.path);
      if (st.isDirectory || st.size > REJECT_FILE_BYTES) {
        skipped.push({ targetIndex: i, path: target.path });
        continue;
      }
      files.push({ targetIndex: i, relInside: basename(target.path), abs: target.path, size: st.size });
    } else {
      await walkFolder(fs, target.path, i, "", files, skipped);
    }
  }

  return { files, skipped };
}

async function walkFolder(
  fs: FsAdapter,
  root: string,
  targetIndex: number,
  relInside: string,
  files: CollectedFile[],
  skipped: SkippedEntry[],
): Promise<void> {
  const dirAbs = relInside === "" ? root : joinPath(root, relInside);
  for (const name of await fs.readdir(dirAbs)) {
    if (isExcludedSegment(name)) continue;
    const abs = joinPath(dirAbs, name);
    const childRel = relInside === "" ? name : `${relInside}/${name}`;
    const st = await fs.stat(abs);
    if (st.isDirectory) {
      await walkFolder(fs, root, targetIndex, childRel, files, skipped);
    } else if (st.size <= REJECT_FILE_BYTES) {
      files.push({ targetIndex, relInside: childRel, abs, size: st.size });
    } else {
      skipped.push({ targetIndex, path: abs });
    }
  }
}

/** Превью объёма без записи на диск: итог, предупреждения (>50 МБ), отклонённые (>200 МБ). */
export async function measureTargetFiles(
  targets: ConfigTarget[],
  fs: FsAdapter,
): Promise<{ totalSize: number; warnings: SkippedEntry[]; rejected: SkippedEntry[]; missing: SkippedEntry[] }> {
  const { files, skipped } = await collectTargetFiles(targets, fs);
  const warnings: SkippedEntry[] = [];
  const rejected: SkippedEntry[] = [];
  let totalSize = 0;
  for (const f of files) {
    totalSize += f.size;
    if (f.size > WARN_FILE_BYTES) warnings.push({ targetIndex: f.targetIndex, path: f.abs });
  }
  for (const s of skipped) {
    if (s.path !== "" && (await fs.exists(s.path))) {
      const st = await fs.stat(s.path);
      if (!st.isDirectory && st.size > WARN_FILE_BYTES) rejected.push(s);
    }
  }
  return { totalSize, warnings, rejected, missing: skipped };
}

/**
 * Снимает файловые цели (file/folder) в snapshotDir.
 * Отсутствующие файлы/цели — в skipped, не ошибка (спека §11).
 */
export async function takeFilesSnapshot(
  targets: ConfigTarget[],
  snapshotDir: string,
  fs: FsAdapter,
  hash: Hasher,
): Promise<TakeFilesResult> {
  const { files: collected, skipped } = await collectTargetFiles(targets, fs);
  const entries: SnapshotFileEntry[] = [];
  let totalSize = 0;

  for (const f of collected) {
    const data = await fs.readFile(f.abs);
    const relPath = `${f.targetIndex}/${f.relInside}`;
    await fs.writeFileBytes(joinPath(snapshotDir, relPath), data);
    entries.push({ targetIndex: f.targetIndex, relPath, size: data.byteLength, hash: hash.sha256(data) });
    totalSize += data.byteLength;
  }

  return { snapshot: { files: entries, registry: [], totalSize }, skipped };
}

/**
 * Восстанавливает файлы снапшота поверх текущих (лишние не удаляются).
 * Файл отсутствует в снапшоте или хэш не сошёлся — ошибка (спека §11).
 */
export async function applyFilesSnapshot(
  targets: ConfigTarget[],
  snapshotDir: string,
  snapshot: Snapshot,
  fs: FsAdapter,
  hash: Hasher,
): Promise<ApplyResult> {
  const errors: string[] = [];
  let restored = 0;

  for (const entry of snapshot.files) {
    const src = joinPath(snapshotDir, entry.relPath);
    if (!(await fs.exists(src))) {
      errors.push(`snapshot entry missing on disk: ${entry.relPath}`);
      continue;
    }
    const data = await fs.readFile(src);
    if (hash.sha256(data) !== entry.hash) {
      errors.push(`snapshot entry corrupted: ${entry.relPath}`);
      continue;
    }
    const slash = entry.relPath.indexOf("/");
    const targetIndex = Number(entry.relPath.slice(0, slash));
    const relInside = entry.relPath.slice(slash + 1);
    const target = targets[targetIndex];
    if (!target || target.type === "registry") {
      errors.push(`snapshot entry has no matching target: ${entry.relPath}`);
      continue;
    }
    const dest = target.type === "file" ? target.path : joinPath(target.path, relInside);
    await fs.mkdirp(dirname(dest));
    await fs.writeFileBytes(dest, data);
    restored++;
  }

  return { restored, imported: 0, errors };
}
