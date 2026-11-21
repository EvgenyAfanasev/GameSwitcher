export type Attrs = Record<string, string | boolean | EventListenerOrEventListenerObject | undefined>;

/** Мини-hyperscript для vanilla DOM. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2), value as EventListener);
    } else if (typeof value === "boolean" ? value : key === "disabled" || key === "checked") {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

/** Затемнение + панель снизу (touch-first). Возвращает close(). */
export function bottomSheet(build: (close: () => void) => HTMLElement): () => void {
  const overlay = h("div", { class: "sheet-overlay" });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const panel = h("div", { class: "sheet-panel" }, build(close));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  return close;
}

/** Список действий в sheet. */
export function actionSheet(title: string, actions: { label: string; danger?: boolean; onSelect: () => void }[]): void {
  bottomSheet((close) => {
    const list = h("div", { class: "sheet-actions" }, h("div", { class: "sheet-title" }, title));
    for (const action of actions) {
      list.appendChild(
        h(
          "button",
          {
            class: `sheet-action${action.danger ? " danger" : ""}`,
            onclick: () => {
              close();
              action.onSelect();
            },
          },
          action.label,
        ),
      );
    }
    return list;
  });
}

export function confirmSheet(title: string, description: string, onConfirm: () => void, confirmLabel = "Удалить"): void {
  bottomSheet((close) => {
    const box = h(
      "div",
      { class: "sheet-actions" },
      h("div", { class: "sheet-title" }, title),
      h("div", { class: "sheet-desc" }, description),
    );
    box.appendChild(
      h(
        "button",
        {
          class: "sheet-action danger",
          onclick: () => {
            close();
            onConfirm();
          },
        },
        confirmLabel,
      ),
    );
    box.appendChild(h("button", { class: "sheet-action", onclick: close }, "Отмена"));
    return box;
  });
}

/** Форма в sheet; onSubmit получает значения полей. */
export function formSheet(
  title: string,
  fields: { key: string; label: string; value?: string; placeholder?: string; type?: string }[],
  submitLabel: string,
  onSubmit: (values: Record<string, string>) => void,
): void {
  bottomSheet((close) => {
    const box = h("div", { class: "sheet-actions" }, h("div", { class: "sheet-title" }, title));
    const values: Record<string, string> = {};
    for (const field of fields) {
      const input = h("input", {
        class: "sheet-input",
        type: field.type ?? "text",
        placeholder: field.placeholder ?? "",
        value: field.value ?? "",
      }) as HTMLInputElement;
      values[field.key] = field.value ?? "";
      input.addEventListener("input", () => {
        values[field.key] = input.value;
      });
      box.appendChild(h("label", { class: "sheet-field" }, h("span", {}, field.label), input));
    }
    box.appendChild(
      h(
        "button",
        {
          class: "sheet-action primary",
          onclick: () => {
            close();
            onSubmit(values);
          },
        },
        submitLabel,
      ),
    );
    return box;
  });
}

const PALETTE = ["#4ade80", "#60a5fa", "#f87171", "#fbbf24", "#c084fc", "#2dd4bd"];

export function colorPicker(selected: string, onSelect: (color: string) => void): HTMLElement {
  const wrap = h("div", { class: "color-picker" });
  for (const color of PALETTE) {
    const dot = h("button", { class: `color-dot${color === selected ? " selected" : ""}`, style: `background:${color}` });
    dot.addEventListener("click", () => {
      wrap.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("selected"));
      dot.classList.add("selected");
      onSelect(color);
    });
    wrap.appendChild(dot);
  }
  return wrap;
}

export function toast(message: string, kind: "info" | "error" = "info"): void {
  const el = h("div", { class: `toast ${kind}` }, message);
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 2600);
}

export function onLongPress(el: HTMLElement, handler: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const start = () => {
    timer = setTimeout(() => {
      timer = null;
      handler();
    }, 500);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchmove", cancel, { passive: true });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    handler();
  });
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
