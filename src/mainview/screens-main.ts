import type { Store } from "../shared/types";
import { resolveEffectiveProfile } from "../core/resolve";
import { actionSheet, confirmSheet, bottomSheet, colorPicker, formSheet, h, onLongPress } from "./ui";
import { api } from "./api";

export interface MainCallbacks {
  onOpenGame(gameId: string): void;
  onAddGame(): void;
  refresh(): void;
}

export function renderMain(container: HTMLElement, store: Store, cb: MainCallbacks): void {
  container.replaceChildren();

  const pills = document.getElementById("mode-pills") as HTMLElement;
  pills.replaceChildren();
  for (const mode of store.modes) {
    const active = store.activeModeId === mode.id;
    const pill = h(
      "button",
      { class: `pill${active ? " active" : ""}`, style: active ? `background:${mode.color};border-color:${mode.color}` : "" },
      h("span", { class: "pill-dot", style: `background:${active ? "rgba(0,0,0,.4)" : mode.color}` }),
      mode.name,
    );
    pill.addEventListener("click", async () => {
      await api.call("setActiveMode", { modeId: active ? null : mode.id });
      cb.refresh();
    });
    onLongPress(pill, () => {
      actionSheet(mode.name, [
        { label: "Переименовать", onSelect: () => renameModeDialog(mode.id, mode.name, mode.color, cb) },
        {
          label: "Удалить режим",
          danger: true,
          onSelect: () =>
            confirmSheet(
              "Удалить режим?",
              `Связанные профили игр станут частными. Активный режим перейдёт на первый оставшийся.`,
              async () => {
                await api.call("deleteMode", { modeId: mode.id });
                cb.refresh();
              },
            ),
        },
      ]);
    });
    pills.appendChild(pill);
  }
  pills.appendChild(h("button", { class: "pill add-pill", onclick: () => createModeDialog(store.modes.length === 0, cb) }, "+ Режим"));

  if (store.games.length === 0) {
    container.appendChild(
      h(
        "div",
        { class: "empty" },
        h("div", { class: "empty-icon" }, "🎮"),
        h("div", {}, "Нет игр"),
        h("div", { class: "dim" }, "Добавьте игру и создайте режим сверху (например, Eco) —"),
        h("div", { class: "dim" }, "профили графики будут привязываться к режимам"),
      ),
    );
  } else {
    const list = h("div", { class: "game-list" });
    for (const game of store.games) {
      list.appendChild(gameRow(game, store, cb));
    }
    container.appendChild(list);
  }
}

function gameRow(game: Store["games"][number], store: Store, cb: MainCallbacks): HTMLElement {
  const effective = resolveEffectiveProfile(game, store.activeModeId);
  const mode = effective?.modeId ? store.modes.find((m) => m.id === effective.modeId) : null;

  let badge: HTMLElement;
  if (effective && game.overrideProfileId === effective.id) {
    badge = h("span", { class: "badge override" }, "⚡ ", effective.name);
  } else if (effective && mode) {
    badge = h("span", { class: "badge", style: `--badge:${mode.color}` }, effective.name);
  } else {
    badge = h("span", { class: "badge none" }, "—");
  }

  const row = h(
    "div",
    { class: "game-row" },
    h(
      "div",
      { class: "game-info" },
      h("div", { class: "game-name" }, game.name),
      badge,
    ),
    h(
      "button",
      {
        class: "launch-btn",
        onclick: async (e) => {
          e.stopPropagation();
          const res = await api.call("launchGame", { gameId: game.id });
          if (!res.ok) window.alert(res.error);
        },
      },
      "▶",
    ),
  );
  row.addEventListener("click", () => cb.onOpenGame(game.id));
  return row;
}

export function createModeDialog(isFirst: boolean, cb: MainCallbacks): void {
  let color = "#4ade80";
  bottomSheet((close) => {
    const box = h("div", { class: "sheet-actions" }, h("div", { class: "sheet-title" }, "Новый режим"));
    const input = h("input", { class: "sheet-input", placeholder: "Например: Eco, Performance…" }) as HTMLInputElement;
    box.appendChild(h("label", { class: "sheet-field" }, h("span", {}, "Название"), input));
    box.appendChild(h("div", { class: "sheet-field" }, h("span", {}, "Цвет"), colorPicker(color, (c) => (color = c))));
    box.appendChild(
      h(
        "button",
        {
          class: "sheet-action primary",
          onclick: async () => {
            close();
            await api.call("createMode", { name: input.value, color });
            if (isFirst) {
              const res = await api.call("getState");
              if (res.ok && res.data.modes.length === 1) {
                await api.call("setActiveMode", { modeId: res.data.modes[0].id });
              }
            }
            cb.refresh();
          },
        },
        "Создать",
      ),
    );
    return box;
  });
}

function renameModeDialog(modeId: string, name: string, prevColor: string, cb: MainCallbacks): void {
  let color = prevColor;
  bottomSheet((close) => {
    const box = h("div", { class: "sheet-actions" }, h("div", { class: "sheet-title" }, "Переименовать режим"));
    const input = h("input", { class: "sheet-input", value: name }) as HTMLInputElement;
    box.appendChild(h("label", { class: "sheet-field" }, h("span", {}, "Название"), input));
    box.appendChild(h("div", { class: "sheet-field" }, h("span", {}, "Цвет"), colorPicker(color, (c) => (color = c))));
    box.appendChild(
      h(
        "button",
        {
          class: "sheet-action primary",
          onclick: async () => {
            close();
            await api.call("renameMode", { modeId, name: input.value });
            cb.refresh();
          },
        },
        "Сохранить",
      ),
    );
    return box;
  });
}
