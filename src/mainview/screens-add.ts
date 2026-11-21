import type { ConfigTarget, Game } from "../shared/types";
import type { MeasureResult } from "../shared/rpc";
import type { ProbeResult } from "../core/scanner";
import { actionSheet, confirmSheet, fmtSize, formSheet, h, toast } from "./ui";
import { api } from "./api";

export interface AddCallbacks {
  onDone(gameId: string | null): void;
}

interface State {
  gameId: string | null;
  exePath: string;
  name: string;
  steamAppId: string;
  iconPath: string;
  targets: ConfigTarget[];
  probe: ProbeResult | null;
  measured: MeasureResult | null;
}

export function renderAdd(container: HTMLElement, existing: Game | null, cb: AddCallbacks): void {
  const state: State = {
    gameId: existing?.id ?? null,
    exePath: existing?.exePath ?? "",
    name: existing?.name ?? "",
    steamAppId: existing?.steamAppId ?? "",
    iconPath: existing?.iconPath ?? "",
    targets: existing ? existing.configTargets.map((t) => ({ ...t })) : [],
    probe: null,
    measured: null,
  };

  container.replaceChildren();
  container.appendChild(
    h(
      "div",
      { class: "screen-header" },
      h("button", { class: "back-btn", onclick: () => cb.onDone(state.gameId) }, "‹"),
      h("div", { class: "screen-title" }, existing ? "Изменить игру" : "Новая игра"),
    ),
  );

  const body = h("div", { class: "section" });
  container.appendChild(body);

  const nameInput = h("input", { class: "sheet-input", placeholder: "Название игры", value: state.name }) as HTMLInputElement;
  const exeInput = h("input", { class: "sheet-input", placeholder: "Путь к .exe", value: state.exePath, readonly: true }) as HTMLInputElement;
  const appIdInput = h("input", { class: "sheet-input", placeholder: "Например: 1245620", value: state.steamAppId, inputmode: "numeric" }) as HTMLInputElement;

  body.appendChild(h("div", { class: "field" }, h("span", { class: "field-label" }, "Название"), nameInput));
  body.appendChild(
    h(
      "div",
      { class: "field" },
      h("span", { class: "field-label" }, "Файл игры (.exe)"),
      exeInput,
      h(
        "button",
        {
          class: "sheet-action",
          onclick: async () => {
            const picked = await api.call("pickExe");
            if (!picked) return;
            state.exePath = picked;
            exeInput.value = picked;
            if (!nameInput.value) nameInput.value = defaultName(picked);
            await runProbe(state, body);
          },
        },
        "Выбрать файл…",
      ),
    ),
  );
  body.appendChild(
    h("div", { class: "field" }, h("span", { class: "field-label" }, "Steam AppID (необязательно)"), appIdInput),
  );

  const probeSection = h("div", { class: "section" });
  container.appendChild(probeSection);

  if (state.exePath) {
    void runProbe(state, probeSection);
  }

  const targetsSection = h("div", { class: "section" }, h("div", { class: "section-title" }, "Цели настроек"));
  const targetsList = h("div", { class: "targets-list" });
  const measureInfo = h("div", { class: "dim" });
  targetsSection.appendChild(targetsList);
  targetsSection.appendChild(measureInfo);
  targetsSection.appendChild(
    h(
      "button",
      {
        class: "sheet-action",
        onclick: () => manualAddSheet(state, () => redrawTargets(state, targetsList, measureInfo)),
      },
      "+ Добавить цель вручную",
    ),
  );
  container.appendChild(targetsSection);

  container.appendChild(
    h(
      "button",
      {
        class: "sheet-action primary",
        onclick: () => void save(state, nameInput, appIdInput, cb),
      },
      existing ? "Сохранить изменения" : "Добавить игру",
    ),
  );
  if (existing) {
    container.appendChild(
      h(
        "button",
        {
          class: "sheet-action danger",
          onclick: () =>
            confirmSheet("Удалить игру?", `«${existing.name}» и все её профили будут удалены.`, async () => {
              await api.call("deleteGame", { gameId: existing.id });
              cb.onDone(null);
            }),
        },
        "Удалить игру",
      ),
    );
  }

  redrawTargets(state, targetsList, measureInfo);
}

function defaultName(exePath: string): string {
  const base = exePath.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/\.exe$/i, "");
}

async function runProbe(state: State, section: HTMLElement): Promise<void> {
  section.replaceChildren(h("div", { class: "dim" }, "Ищем настройки…"));
  const res = await api.call("probe", { exePath: state.exePath });
  if (!res.ok) {
    state.probe = null;
    section.replaceChildren(h("div", { class: "dim" }, res.error));
    return;
  }
  state.probe = res.data;
  drawProbe(state, section);
}

function drawProbe(state: State, section: HTMLElement): void {
  section.replaceChildren();
  if (!state.probe) return;
  section.appendChild(h("div", { class: "section-title" }, "Найденные настройки"));
  for (const note of state.probe.notes) {
    section.appendChild(h("div", { class: "hint" }, note));
  }
  if (state.probe.candidates.length === 0) {
    section.appendChild(h("div", { class: "dim" }, "Типичные места не найдены — добавьте цель вручную ниже"));
    return;
  }

  const already = new Set(state.targets.map((t) => JSON.stringify(t)));
  for (const candidate of state.probe.candidates) {
    const target = candidate.target;
    const key = JSON.stringify(target);
    const checked = already.has(key);
    const row = h(
      "div",
      { class: "candidate-row" },
      h("div", { class: "candidate-info" }, `${candidate.label} — ${candidateLabel(target)}`, candidate.note ? h("span", { class: "dim" }, ` · ${candidate.note}`) : null),
    );
    const toggle = () => {
      if (already.has(key)) {
        already.delete(key);
        state.targets = state.targets.filter((t) => JSON.stringify(t) !== key);
      } else {
        already.add(key);
        state.targets.push(target);
      }
      row.classList.toggle("picked", already.has(key));
      void redrawMeasure(state);
    };
    row.addEventListener("click", toggle);
    row.classList.toggle("picked", checked);
    section.appendChild(row);
  }
  section.appendChild(h("div", { class: "dim" }, "Нажмите, чтобы включить/исключить цель"));
}

function candidateLabel(target: ConfigTarget): string {
  return target.type === "registry" ? target.key : target.type === "file" ? target.path : `${target.path}/`;
}

async function redrawMeasure(state: State): Promise<void> {
  const info = document.querySelector<HTMLElement>(".measure-info");
  if (!info) return;
  if (state.targets.length === 0) {
    info.replaceChildren();
    return;
  }
  info.replaceChildren(h("span", { class: "dim" }, "Считаем размер…"));
  const res = await api.call("measureTargets", { targets: state.targets });
  if (res.ok) {
    state.measured = res.data;
    const parts = [`всего ${fmtSize(res.data.totalSize)}`];
    if (res.data.warnings.length > 0) parts.push(`больших файлов: ${res.data.warnings.length}`);
    if (res.data.rejected.length > 0) parts.push(`пропущено слишком больших: ${res.data.rejected.length}`);
    if (res.data.missing.length > 0) parts.push(`не найдено: ${res.data.missing.length}`);
    info.replaceChildren(res.data.totalSize > 200 * 1024 * 1024 ? h("span", { class: "warn" }, parts.join(" · ")) : h("span", { class: "dim" }, parts.join(" · ")));
  } else {
    info.replaceChildren(h("span", { class: "warn" }, res.error));
  }
}

function redrawTargets(state: State, list: HTMLElement, measureInfo: HTMLElement): void {
  list.replaceChildren();
  for (const target of state.targets) {
    const row = h(
      "div",
      { class: "target-line" },
      h("span", { class: "target-kind" }, kindLabel(target.type)),
      h("span", { class: "target-path" }, candidateLabel(target)),
      h(
        "button",
        {
          class: "icon-btn",
          onclick: () => {
            state.targets = state.targets.filter((t) => t !== target);
            redrawTargets(state, list, measureInfo);
            void redrawMeasure(state);
          },
        },
        "✕",
      ),
    );
    list.appendChild(row);
  }
  if (state.targets.length === 0) {
    list.appendChild(h("div", { class: "dim" }, "Цели не выбраны"));
  }
  measureInfo.classList.add("measure-info");
  void redrawMeasure(state);
}

function kindLabel(type: string): string {
  return type === "registry" ? "реестр" : type === "file" ? "файл" : "папка";
}

function manualAddSheet(state: State, onChange: () => void): void {
  actionSheet("Добавить цель", [
    {
      label: "Файл…",
      onSelect: async () => {
        const picked = await api.call("pickFile");
        if (picked) {
          state.targets.push({ type: "file", path: picked });
          onChange();
        }
      },
    },
    {
      label: "Папка…",
      onSelect: async () => {
        const picked = await api.call("pickFolder");
        if (picked) {
          state.targets.push({ type: "folder", path: picked });
          onChange();
        }
      },
    },
    {
      label: "Ветка реестра…",
      onSelect: () => {
        formSheet(
          "Ветка реестра",
          [{ key: "key", label: "Ключ (HKCU\\…)", placeholder: "HKCU\\Software\\MyGame" }],
          "Добавить",
          async (values) => {
            const key = values.key.trim();
            if (!key) return;
            state.targets.push({ type: "registry", key });
            onChange();
          },
        );
      },
    },
  ]);
}

async function save(
  state: State,
  nameInput: HTMLInputElement,
  appIdInput: HTMLInputElement,
  cb: AddCallbacks,
): Promise<void> {
  const name = nameInput.value.trim();
  if (!name) {
    toast("Укажите название", "error");
    return;
  }
  if (!state.exePath) {
    toast("Выберите .exe файл игры", "error");
    return;
  }
  const patch = {
    name,
    exePath: state.exePath,
    steamAppId: appIdInput.value.trim() || null,
    iconPath: state.iconPath || null,
    configTargets: state.targets,
  };
  if (state.gameId) {
    const res = await api.call("updateGame", { gameId: state.gameId, patch });
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    cb.onDone(state.gameId);
  } else {
    const res = await api.call("addGame", patch);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    cb.onDone(null);
  }
}
