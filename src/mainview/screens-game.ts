import type { Game, Store } from "../shared/types";
import { resolveEffectiveProfile } from "../core/resolve";
import { actionSheet, bottomSheet, confirmSheet, fmtSize, formSheet, h } from "./ui";
import { api } from "./api";

export interface GameCallbacks {
  onBack(): void;
  onEditGame(game: Game): void;
  onDeleteGame(game: Game): void;
  refresh(): void;
}

export function renderGame(container: HTMLElement, store: Store, game: Game, cb: GameCallbacks): void {
  container.replaceChildren();

  const header = h(
    "div",
    { class: "screen-header" },
    h("button", { class: "back-btn", onclick: () => cb.onBack() }, "‹"),
    h("div", { class: "screen-title" }, game.name),
    h(
      "button",
      {
        class: "more-btn",
        onclick: () =>
          actionSheet(game.name, [
            { label: "Изменить игру и цели настроек", onSelect: () => cb.onEditGame(game) },
            {
              label: "Удалить игру",
              danger: true,
              onSelect: () =>
                confirmSheet("Удалить игру?", `«${game.name}» и все её профили будут удалены.`, async () => {
                  await api.call("deleteGame", { gameId: game.id });
                  cb.onBack();
                  cb.refresh();
                }),
            },
          ]),
      },
      "⋯",
    ),
  );
  container.appendChild(header);

  const effective = resolveEffectiveProfile(game, store.activeModeId);
  const activeMode = store.activeModeId ? store.modes.find((m) => m.id === store.activeModeId) : null;

  container.appendChild(
    h(
      "button",
      {
        class: "launch-big",
        onclick: async () => {
          const res = await api.call("launchGame", { gameId: game.id });
          if (!res.ok) window.alert(res.error);
        },
      },
      "▶ Запустить",
    ),
  );

  const effectiveCard = h(
    "div",
    { class: "section" },
    h("div", { class: "section-title" }, "Профиль при запуске"),
    h(
      "button",
      { class: "effective-card", onclick: () => chooseOverrideSheet(store, game, cb) },
      effective ? effectiveBadge(store, game, effective) : h("span", { class: "dim" }, "Как есть — без изменений"),
      h("span", { class: "chev" }, "›"),
    ),
  );
  container.appendChild(effectiveCard);

  const profilesSection = h("div", { class: "section" }, h("div", { class: "section-title" }, "Профили"));
  if (activeMode) {
    profilesSection.appendChild(
      h(
        "div",
        { class: "hint" },
        `Глобальный режим: ${activeMode.name}. Профиль с этим режимом применится автоматически.`,
      ),
    );
  }

  if (game.profiles.length === 0) {
    profilesSection.appendChild(
      h("div", { class: "empty small" }, "Профилей ещё нет. Настройте графику в игре, затем сохраните профиль."),
    );
  }
  for (const profile of game.profiles) {
    profilesSection.appendChild(profileRow(store, game, profile, cb));
  }

  profilesSection.appendChild(h("button", { class: "big-add slim", onclick: () => addProfileSheet(store, game, cb) }, "+ Профиль"));
  container.appendChild(profilesSection);

  const targetsSection = h("div", { class: "section" }, h("div", { class: "section-title" }, "Что сохраняется"));
  for (const target of game.configTargets) {
    const label =
      target.type === "registry" ? target.key : target.type === "file" ? target.path : `${target.path}/`;
    targetsSection.appendChild(h("div", { class: "target-line" }, h("span", { class: "target-kind" }, kindLabel(target.type)), label));
  }
  if (game.configTargets.length === 0) {
    targetsSection.appendChild(h("div", { class: "dim" }, "Цели не заданы — профили будут пустыми"));
  }
  container.appendChild(targetsSection);
}

function kindLabel(type: string): string {
  return type === "registry" ? "реестр" : type === "file" ? "файл" : "папка";
}

function effectiveBadge(store: Store, game: Game, profileIdOrProfile: ReturnType<typeof resolveEffectiveProfile>): HTMLElement {
  if (!profileIdOrProfile) return h("span", { class: "dim" }, "Как есть");
  const profile = profileIdOrProfile;
  if (game.overrideProfileId === profile.id) {
    return h("span", { class: "badge override" }, "⚡ ", profile.name);
  }
  const mode = profile.modeId ? store.modes.find((m) => m.id === profile.modeId) : null;
  if (mode) {
    return h("span", { class: "badge", style: `--badge:${mode.color}` }, profile.name);
  }
  return h("span", { class: "badge" }, profile.name);
}

function profileRow(store: Store, game: Game, profile: Game["profiles"][number], cb: GameCallbacks): HTMLElement {
  const mode = profile.modeId ? store.modes.find((m) => m.id === profile.modeId) : null;
  const isEffective = resolveEffectiveProfile(game, store.activeModeId)?.id === profile.id;

  const row = h(
    "div",
    { class: `profile-row${isEffective ? " current" : ""}` },
    h(
      "div",
      { class: "profile-info" },
      h("div", { class: "profile-name" }, profile.name, isEffective ? h("span", { class: "now-tag" }, "при запуске") : null),
      h(
        "div",
        { class: "profile-sub" },
        mode
          ? h("span", { class: "mode-chip", style: `--chip:${mode.color}` }, mode.name)
          : h("span", { class: "dim" }, "частный"),
        h("span", { class: "dim" }, ` · ${fmtSize(profile.snapshot.totalSize)}`),
      ),
    ),
    mode
      ? h(
          "button",
          {
            class: "icon-btn",
            title: "Обновить из текущих настроек игры",
            onclick: async () => {
              const res = await api.call("replaceLinkedProfile", { gameId: game.id, profileId: profile.id });
              if (!res.ok) window.alert(res.error);
              else cb.refresh();
            },
          },
          "↻",
        )
      : null,
  );

  row.addEventListener("click", () => {
    actionSheet(profile.name, [
      game.overrideProfileId === profile.id
        ? {
            label: "Следовать глобальному режиму",
            onSelect: async () => {
              await api.call("setOverride", { gameId: game.id, profileId: null });
              cb.refresh();
            },
          }
        : {
            label: "Всегда использовать этот профиль",
            onSelect: async () => {
              await api.call("setOverride", { gameId: game.id, profileId: profile.id });
              cb.refresh();
            },
          },
      ...(mode
        ? [
            {
              label: "Обновить из текущих настроек (↻)",
              onSelect: async () => {
                const res = await api.call("replaceLinkedProfile", { gameId: game.id, profileId: profile.id });
                if (!res.ok) window.alert(res.error);
                else cb.refresh();
              },
            },
          ]
        : []),
      {
        label: "Удалить профиль",
        danger: true,
        onSelect: () =>
          confirmSheet("Удалить профиль?", `«${profile.name}» будет удалён безвозвратно.`, async () => {
            await api.call("deleteProfile", { gameId: game.id, profileId: profile.id });
            cb.refresh();
          }),
      },
    ]);
  });
  return row;
}

function chooseOverrideSheet(store: Store, game: Game, cb: GameCallbacks): void {
  const actions = [
    {
      label: "Следовать глобальному режиму",
      onSelect: async () => {
        await api.call("setOverride", { gameId: game.id, profileId: null });
        cb.refresh();
      },
    },
    ...game.profiles.map((profile) => ({
      label: profile.name,
      onSelect: async () => {
        await api.call("setOverride", { gameId: game.id, profileId: profile.id });
        cb.refresh();
      },
    })),
  ];
  actionSheet("Профиль при запуске", actions);
}

function addProfileSheet(store: Store, game: Game, cb: GameCallbacks): void {
  const takenModes = new Set(game.profiles.map((p) => p.modeId));
  const actions: { label: string; disabledHint: string | null; onSelect: () => void }[] = store.modes.map((mode) => ({
    label: `Для режима «${mode.name}»`,
    disabledHint: takenModes.has(mode.id) ? "слот занят" : null,
    onSelect: async () => {
      const res = await api.call("takeLinkedProfile", { gameId: game.id, modeId: mode.id });
      reportTake(res);
      cb.refresh();
    },
  }));
  actions.push({
    label: "Частный профиль…",
    disabledHint: null,
    onSelect: () => {
      formSheet(
        "Частный профиль",
        [{ key: "name", label: "Название", placeholder: "Например: Поездка" }],
        "Сохранить из текущих настроек",
        async (values) => {
          if (!values.name.trim()) return;
          const res = await api.call("addPrivateProfile", { gameId: game.id, name: values.name, targets: game.configTargets });
          reportTake(res);
          cb.refresh();
        },
      );
    },
  });

  bottomSheet((close) => {
    const box = h("div", { class: "sheet-actions" }, h("div", { class: "sheet-title" }, "Новый профиль"));
    box.appendChild(
      h("div", { class: "hint" }, "Профиль снимет текущие настройки игры. Сначала настройте графику в игре."),
    );
    for (const action of actions) {
      const btn = h(
        "button",
        {
          class: "sheet-action",
          onclick: () => {
            close();
            action.onSelect();
          },
        },
        action.label,
      );
      if (action.disabledHint) {
        btn.setAttribute("disabled", "true");
        btn.appendChild(h("span", { class: "action-hint" }, action.disabledHint));
      }
      box.appendChild(btn);
    }
    return box;
  });
}

function reportTake(res: Awaited<ReturnType<typeof api.call<"takeLinkedProfile">>>): void {
  if (!res.ok) {
    window.alert(res.error);
    return;
  }
  const parts: string[] = [];
  if (res.data.skipped.length > 0) parts.push(`пропущено: ${res.data.skipped.length}`);
  if (res.data.errors.length > 0) parts.push(`ошибок: ${res.data.errors.length}`);
  window.alert(parts.length > 0 ? `Профиль сохранён (${parts.join(", ")})` : "Профиль сохранён");
}
