# GameSwitcher — план реализации

Дата: 2026-11-21
Спека: `docs/superpowers/specs/2026-11-21-gameswitcher-design.md`
Среда разработки: Linux (bun 1.3.5, node 26) → целевая платформа Windows. Юнит-тесты и UI-каркас гоняются на Linux; реестр/запуск — только на Windows (ручная проверка + CI windows-later).

## Каркас проекта (Electrobun 2)

```
GameSwitcher/
├── electrobun.config.ts        # app meta, mainProcess: bun, copy mainview → views/
├── hutch.config.ts             # задачи hutch (генерится electrobun init)
├── package.json                # electrobun@2 (dev), bun test
├── tsconfig.json
└── src/
    ├── shared/
    │   └── types.ts            # Store, Mode, Game, GameProfile, ConfigTarget, Snapshot...
    ├── core/                   # ЧИСТЫЕ модули без Electrobun API — юнит-тесты на bun test
    │   ├── store.ts            # load/save store.json, миграции по version
    │   ├── invariants.ts       # валидация инвариантов (слот на режим, override-ссылки)
    │   ├── resolve.ts          # resolveEffectiveProfile(game, activeModeId)
    │   ├── snapshot-files.ts   # снятие/применение файловых снапшотов (fs-адаптер)
    │   ├── snapshot-registry.ts# reg export/import (proc-адаптер, Windows)
    │   ├── scanner.ts          # кандидаты целей (fs-адаптер, правила п.7 спеки)
    │   └── paths.ts            # %APPDATA% и т.п.
    ├── bun/                    # main-процесс Electrobun: адаптеры + клей
    │   ├── index.ts            # создание окна, rpc-роутер
    │   ├── adapters/fs.ts      # node:fs реализация FsAdapter
    │   ├── adapters/proc.ts    # reg.exe, tasklist, powershell (иконка)
    │   ├── adapters/launch.ts  # spawn exe / steam://
    │   ├── api.ts              # RPC-схема: типизированные сообщения UI↔main
    │   └── handlers/           # store, modes, games, profiles, launcher, settings
    └── mainview/               # UI (vanilla TS)
        ├── index.html / index.css / index.ts
        ├── i18n.ts             # все строки
        ├── screens/            # main, game, addGame, settings
        └── components/         # sheet, badge, pill...
```

Принцип: `src/core/*` зависит только от интерфейсов адаптеров (`FsAdapter`, `ProcAdapter`) — тестируется с фейками на Linux, main-процесс подставляет реальные.

## Этапы

### Этап 1 — Core (чистая логика + тесты)
- [ ] `shared/types.ts` — все типы схемы store.json (v1)
- [ ] `core/store.ts` + `core/invariants.ts` + `core/resolve.ts`
- [ ] `core/snapshot-files.ts`, `core/snapshot-registry.ts` (интерфейс ProcAdapter)
- [ ] `core/scanner.ts` (правила спеки §7: My Games/Saved\Config, исключения сейвов, лимиты 50/200 МБ)
- [ ] bun-тесты: resolve (все ветки 1-2-3), инварианты, snapshot-files (фикстуры в tmp), scanner (fake fs), store CRUD
- **Критерий:** все тесты зелёные на Linux

### Этап 2 — Shell
- [ ] `electrobun init`-структура: config-файлы, окно, минимальный rpc (ping/pong)
- [ ] `bun test` запускается; `hutch` dev-сборка открывает окно (на Linux проверяем что собирается, полный прогон — Windows)
- **Критерий:** окно открывается, UI ↔ main RPC работает

### Этап 3 — Данные + главный экран
- [ ] store на диске (%APPDATA%/GameSwitcher), CRUD режимов и игр по RPC
- [ ] Главный экран: список игр, пилюли режимов, бейджи эффективных профилей, «⋯»-меню (sheet)
- **Критерий:** можно создать режимы и «игры-заглушки», переключение активного режима отражается в бейджах

### Этап 4 — Добавление игры + сканер
- [ ] Экран добавления: exe → имя/иконка (powershell ExtractAssociatedIcon), Steam AppID
- [ ] Сканер кандидатов + чекбоксы + ручное добавление целей
- **Критерий:** реальная игра добавляется с целями на Windows-машине

### Этап 5 — Экран игры и профили
- [ ] Сохранение профиля (в режим / частный), слоты, ↻ с подтверждением
- [ ] Override-переключатель, список профилей, удаление
- **Критерий:** полный цикл «сохранил два профиля → переключаю глобальный → бейджи меняются»

### Этап 6 — Launcher
- [ ] tasklist-проверка, apply (файлы + reg import), spawn exe / steam://
- [ ] Ошибки: «игра запущена», «ошибка применения» + Повторить; сворачивание окна
- **Критерий:** на Windows: игра стартует с применённым профилем Eco/Perf

### Этап 7 — Полировка
- [ ] Настройки: автозапуск (HKCU Run), удаление режима → профили становятся частными
- [ ] Пустые состояния, подтверждения удалений, предупреждение >50 МБ
- [ ] Ручной чек-лист на приставке; GitHub Actions windows-latest: build + smoke

## Веха проверки на устройстве (после Этапа 6)

1. Добавить 1–2 реальные игры, указать цели (проверить сканер подсказками).
2. Сохранить Eco и Performance профили, переключить режимы, запустить — настройки применились.
3. Проверить Steam-игру через steam://rungameid.
4. Проверить «игра уже запущена» и «нет профиля для режима».
