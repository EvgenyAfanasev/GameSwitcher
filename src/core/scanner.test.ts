import { describe, expect, test } from "bun:test";
import { probeForGame } from "./scanner";
import { FakeProc, MemFs, envOf } from "./test-helpers";

const exe = "C:/Games/MyGame/Binaries/MyGame.exe";

describe("probeForGame", () => {
  test("Documents/My Games: узкая цель Saved/Config для Unreal", async () => {
    const fs = MemFs.fromFiles({
      "C:/Users/u/Documents/My Games/MyGame/Saved/Config/Windows/Engine.ini": "",
      "C:/Users/u/Documents/My Games/MyGame/Saved/other.ini": "",
    });
    const proc = new FakeProc(() => ({ code: 1 }));
    const { candidates } = await probeForGame(exe, fs, proc, envOf({ USERPROFILE: "C:/Users/u", LOCALAPPDATA: "C:/Users/u/AppData/Local" }));
    const folder = candidates.find((c) => c.target.type === "folder");
    expect(folder?.target).toEqual({ type: "folder", path: "C:/Users/u/Documents/My Games/MyGame/Saved/Config" });
    expect(folder?.note).toContain("Unreal");
  });

  test("LocalAppData <base> попадает в кандидаты", async () => {
    const fs = MemFs.fromFiles({ "C:/Users/u/AppData/Local/MyGame/settings.json": "{}" });
    const proc = new FakeProc(() => ({ code: 1 }));
    const { candidates } = await probeForGame(exe, fs, proc, envOf({ USERPROFILE: "C:/Users/u", LOCALAPPDATA: "C:/Users/u/AppData/Local" }));
    expect(candidates.some((c) => c.target.type === "folder" && c.target.path.endsWith("Local/MyGame"))).toBe(true);
  });

  test("конфиги рядом с exe подбираются как file-цели", async () => {
    const fs = MemFs.fromFiles({ "C:/Games/MyGame/Binaries/settings.ini": "", "C:/Games/MyGame/Binaries/data.pak": "" });
    const proc = new FakeProc(() => ({ code: 1 }));
    const { candidates } = await probeForGame(exe, fs, proc, envOf({}));
    const fileTargets = candidates.filter((c) => c.target.type === "file");
    expect(fileTargets.map((c) => (c.target as { path: string }).path)).toEqual(["C:/Games/MyGame/Binaries/settings.ini"]);
  });

  test("реестр HKCU\\Software\\<base> находится через reg query", async () => {
    const fs = new MemFs();
    const proc = new FakeProc((cmd, args) => (cmd === "reg" && args.includes("HKCU\\Software\\MyGame") ? { code: 0 } : { code: 1 }));
    const { candidates } = await probeForGame(exe, fs, proc, envOf({}));
    const reg = candidates.find((c) => c.target.type === "registry");
    expect(reg?.target).toEqual({ type: "registry", key: "HKCU\\Software\\MyGame" });
  });

  test("ничего не найдено — пустой список + подсказка", async () => {
    const fs = new MemFs();
    const proc = new FakeProc(() => ({ code: 1 }));
    const { candidates, notes } = await probeForGame(exe, fs, proc, envOf({}));
    expect(candidates).toHaveLength(0);
    expect(notes.length).toBeGreaterThan(0);
  });

  test("нет reg.exe (не Windows) — просто нет реестровой цели, без падения", async () => {
    const fs = new MemFs();
    const proc = new FakeProc(() => {
      throw new Error("spawn ENOENT");
    });
    const result = await probeForGame(exe, fs, proc, envOf({}));
    expect(result.candidates).toHaveLength(0);
  });
});
