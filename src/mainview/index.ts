import { api } from "./api";
import { renderMain } from "./screens-main";
import { renderGame } from "./screens-game";
import { renderAdd } from "./screens-add";
import { toast } from "./ui";
import type { Store } from "../shared/types";

const content = document.getElementById("content") as HTMLElement;
const addBtn = document.getElementById("add-game") as HTMLButtonElement;

let store: Store | null = null;
let currentGameId: string | null = null;
let editing: { gameId: string } | null = null;

async function refresh(): Promise<void> {
  const res = await api.call("getState");
  if (!res.ok) {
    toast(res.error, "error");
    return;
  }
  store = res.data;
  if (editing) {
    renderAddScreen(editing.gameId);
    return;
  }
  if (currentGameId && store && store.games.some((g) => g.id === currentGameId)) {
    renderGameScreen(currentGameId);
    return;
  }
  currentGameId = null;
  renderMainScreen();
}

function renderMainScreen(): void {
  if (!store) return;
  addBtn.hidden = false;
  renderMain(content, store, {
    onOpenGame: (gameId) => {
      currentGameId = gameId;
      renderGameScreen(gameId);
    },
    onAddGame: () => {
      editing = null;
      renderAddScreen(null);
    },
    refresh,
  });
}

function renderGameScreen(gameId: string): void {
  if (!store) return;
  const game = store.games.find((g) => g.id === gameId);
  if (!game) {
    currentGameId = null;
    renderMainScreen();
    return;
  }
  addBtn.hidden = true;
  renderGame(content, store, game, {
    onBack: () => {
      currentGameId = null;
      renderMainScreen();
    },
    onEditGame: (g) => {
      editing = { gameId: g.id };
      renderAddScreen(g.id);
    },
    onDeleteGame: () => {
      currentGameId = null;
      renderMainScreen();
    },
    refresh,
  });
}

function renderAddScreen(gameId: string | null): void {
  addBtn.hidden = true;
  const existing = gameId && store ? store.games.find((g) => g.id === gameId) ?? null : null;
  renderAdd(content, existing, {
    onDone: (savedId) => {
      editing = null;
      if (savedId) {
        currentGameId = savedId;
        void refresh();
      } else {
        currentGameId = null;
        void refresh();
      }
    },
  });
}

addBtn.addEventListener("click", () => {
  editing = null;
  renderAddScreen(null);
});

void refresh();
