import { describe, expect, test } from "bun:test";
import { applyFilesSnapshot, takeFilesSnapshot } from "./snapshot-files";
import { MemFs, realHasher } from "./test-helpers";
import type { ConfigTarget, Snapshot } from "../shared/types";

const hash = realHasher();

const targets: ConfigTarget[] = [
  { type: "file", path: "C:/Games/MyGame/Settings.ini" },
  { type: "folder", path: "C:/Games/MyGame/Config" },
  { type: "registry", key: "HKCU\\Software\\MyGame" },
];

function storeWith(exeIni: string, cfgFiles: Record<string, string>) {
  const fs = MemFs.fromFiles({ "C:/Games/MyGame/Settings.ini": exeIni, ...mapKeys(cfgFiles, (k) => `C:/Games/MyGame/Config/${k}`) });
  return fs;
}

const mapKeys = (obj: Record<string, string>, fn: (k: string) => string): Record<string, string> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [fn(k), v]));

describe("takeFilesSnapshot", () => {
  test("копирует file и folder цели, registry пропускает, считает хэши и объём", async () => {
    const fs = storeWith("Quality=High", { "Engine.ini": "[Render]", "Game.ini": "[Game]" });
    const dir = "snapdir";
    const { snapshot, skipped } = await takeFilesSnapshot(targets, dir, fs, hash);
    expect(skipped).toEqual([]);
    expect(snapshot.files).toHaveLength(3);
    expect(snapshot.totalSize).toBe("Quality=High".length + "[Render]".length + "[Game]".length);
    const stored = await fs.readFile("snapdir/0/Settings.ini");
    expect(new TextDecoder().decode(stored)).toBe("Quality=High");
    const entry = snapshot.files.find((f) => f.relPath === "1/Engine.ini");
    expect(entry).toBeDefined();
    expect(entry!.hash).toBe(hash.sha256(new TextEncoder().encode("[Render]")));
  });

  test("папки saves/savegames исключаются из обхода", async () => {
    const fs = MemFs.fromFiles({
      "C:/Games/MyGame/Config/Engine.ini": "[Render]",
      "C:/Games/MyGame/Config/saves/progress.sav": "do-not-touch",
      "C:/Games/MyGame/Config/SaveGames/autosave.sav": "do-not-touch",
    });
    const { snapshot } = await takeFilesSnapshot([{ type: "folder", path: "C:/Games/MyGame/Config" }], "s", fs, hash);
    expect(snapshot.files.map((f) => f.relPath)).toEqual(["0/Engine.ini"]);
  });

  test("отсутствующая цель уходит в skipped, не ошибку", async () => {
    const fs = new MemFs();
    const { snapshot, skipped } = await takeFilesSnapshot(
      [{ type: "file", path: "C:/missing.ini" }, { type: "folder", path: "C:/nope" }],
      "s",
      fs,
      hash,
    );
    expect(snapshot.files).toHaveLength(0);
    expect(skipped.map((s) => s.targetIndex)).toEqual([0, 1]);
  });
});

describe("applyFilesSnapshot", () => {
  async function makeSnapshot(): Promise<{ fs: MemFs; snapshotDir: string; snapshot: Snapshot }> {
    const source = storeWith("Quality=High", { "Engine.ini": "[Render]" });
    const snapshotDir = "snapdir";
    const { snapshot } = await takeFilesSnapshot(targets, snapshotDir, source, hash);
    return { fs: source.clone(), snapshotDir, snapshot };
  }

  test("восстанавливает файлы поверх текущих и создаёт папки", async () => {
    const { fs, snapshotDir, snapshot } = await makeSnapshot();
    fs.putFile("C:/Games/MyGame/Settings.ini", "Quality=Low");
    const result = await applyFilesSnapshot(targets, snapshotDir, snapshot, fs, hash);
    expect(result.errors).toEqual([]);
    expect(result.restored).toBe(2);
    expect(new TextDecoder().decode(await fs.readFile("C:/Games/MyGame/Settings.ini"))).toBe("Quality=High");
    expect(new TextDecoder().decode(await fs.readFile("C:/Games/MyGame/Config/Engine.ini"))).toBe("[Render]");
  });

  test("лишние текущие файлы не удаляются", async () => {
    const { fs, snapshotDir, snapshot } = await makeSnapshot();
    fs.putFile("C:/Games/MyGame/Config/Extra.ini", "[Keep]");
    const result = await applyFilesSnapshot(targets, snapshotDir, snapshot, fs, hash);
    expect(result.errors).toEqual([]);
    expect(new TextDecoder().decode(await fs.readFile("C:/Games/MyGame/Config/Extra.ini"))).toBe("[Keep]");
  });

  test("повреждённый файл снапшота — ошибка в errors, не throw", async () => {
    const { fs, snapshotDir, snapshot } = await makeSnapshot();
    await fs.writeFileBytes("snapdir/0/Settings.ini", new TextEncoder().encode("tampered"));
    const result = await applyFilesSnapshot(targets, snapshotDir, snapshot, fs, hash);
    expect(result.restored).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("corrupted");
  });

  test("круговорот: take → apply → take даёт идентичные снапшоты", async () => {
    const source = storeWith("Quality=Med", { "Engine.ini": "[Render]" });
    const dirA = "a";
    const dirB = "b";
    const first = await takeFilesSnapshot(targets, dirA, source, hash);
    const second = await takeFilesSnapshot(targets, dirB, source, hash);
    expect(first.snapshot).toEqual(second.snapshot);
    const applied = await applyFilesSnapshot(targets, dirA, first.snapshot, source.clone(), hash);
    expect(applied.errors).toEqual([]);
  });
});
