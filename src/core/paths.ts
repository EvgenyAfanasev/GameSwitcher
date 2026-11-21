const norm = (p: string): string => p.replace(/\\/g, "/");

export function joinPath(...parts: string[]): string {
  const joined = parts
    .map(norm)
    .filter((p) => p.length > 0)
    .join("/")
    .replace(/\/{2,}/g, "/");
  return joined;
}

export function basename(p: string): string {
  const n = norm(p);
  const idx = n.lastIndexOf("/");
  return idx === -1 ? n : n.slice(idx + 1);
}

export function dirname(p: string): string {
  const n = norm(p);
  const idx = n.lastIndexOf("/");
  if (idx === -1) return "";
  if (idx === 0) return "/";
  return n.slice(0, idx);
}

export function fileExt(p: string): string {
  const b = basename(p);
  const idx = b.lastIndexOf(".");
  return idx === -1 ? "" : b.slice(idx + 1).toLowerCase();
}
