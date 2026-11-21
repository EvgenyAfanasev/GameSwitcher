import type { ConfigTarget } from "../shared/types";
import type { FsAdapter, ProcAdapter } from "./ports";
import { basename, joinPath } from "./paths";

const TOP_LEVEL_CONFIG_EXT = new Set(["ini", "xml", "json", "cfg", "toml"]);
const PROBE_MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface DetectedTarget {
  target: ConfigTarget;
  label: string;
  note?: string;
}

export interface ProbeResult {
  candidates: DetectedTarget[];
  notes: string[];
}

export interface EnvAdapter {
  get(name: string): string | undefined;
}

/**
 * Эвристический сканер типичных мест настроек по exe-имени игры (спека §9).
 * Ничего не записывает: только кандидаты. Проверка размеров — мягкая (крупные файлы пропускаются).
 */
export async function probeForGame(exePath: string, fs: FsAdapter, proc: ProcAdapter, env: EnvAdapter): Promise<ProbeResult> {
  const candidates: DetectedTarget[] = [];
  const notes: string[] = [];
  const base = basename(exePath).replace(/\.exe$/i, "");

  const myGames = joinPath(env.get("USERPROFILE") ?? "", "Documents", "My Games", base);
  if (await fs.exists(myGames)) {
    await collectFolderTargets(myGames, candidates, fs, "My Games");
  } else {
    notes.push(`Documents\\My Games\\${base} не найдено`);
  }

  const localAppData = joinPath(env.get("LOCALAPPDATA") ?? "", base);
  if (await fs.exists(localAppData)) {
    await collectFolderTargets(localAppData, candidates, fs, "LocalAppData");
  }

  const exeDir = exeDirOf(exePath);
  for (const name of await safeReaddir(fs, exeDir)) {
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    if (name.includes(".") && TOP_LEVEL_CONFIG_EXT.has(ext)) {
      const abs = joinPath(exeDir, name);
      const st = await fs.stat(abs);
      if (!st.isDirectory && st.size <= PROBE_MAX_FILE_BYTES) {
        candidates.push({ target: { type: "file", path: abs }, label: name, note: "рядом с exe" });
      }
    }
  }

  const regKey = `HKCU\\Software\\${base}`;
  try {
    const res = await proc.exec("reg", ["query", regKey]);
    if (res.code === 0) {
      candidates.push({ target: { type: "registry", key: regKey }, label: regKey, note: "реестр" });
    }
  } catch {
    notes.push("reg.exe недоступен — реестр не проверен");
  }

  if (candidates.length === 0) {
    notes.push("типичные места не найдены — добавьте цели вручную");
  }
  return { candidates, notes };
}

async function collectFolderTargets(
  root: string,
  candidates: DetectedTarget[],
  fs: FsAdapter,
  origin: string,
): Promise<void> {
  const narrow = joinPath(root, "Saved", "Config");
  if (await fs.exists(narrow)) {
    candidates.push({ target: { type: "folder", path: narrow }, label: `${origin}\\Saved\\Config`, note: "Unreal Engine" });
    return;
  }
  candidates.push({ target: { type: "folder", path: root }, label: origin });
}

async function safeReaddir(fs: FsAdapter, path: string): Promise<string[]> {
  try {
    if (!(await fs.exists(path))) return [];
    return await fs.readdir(path);
  } catch {
    return [];
  }
}

function exeDirOf(exePath: string): string {
  const norm = exePath.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(0, idx);
}
