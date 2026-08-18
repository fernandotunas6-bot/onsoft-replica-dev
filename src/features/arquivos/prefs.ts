import type { FileArea, FileVisibility } from "./kinds";
import { defaultVisibilityForArea } from "./kinds";

const KEY = "siga:files-prefs";

export type FilesStaffPrefs = {
  defaultArea: FileArea;
  defaultVisibility: FileVisibility;
  viewMode: "list" | "grid";
  sortBy: "name" | "date" | "size";
};

export function readFilesPrefs(role: string): FilesStaffPrefs {
  const fallback: FilesStaffPrefs = {
    defaultArea: role === "Secretaria" || role === "Administrador" ? "secretaria" : "pessoal",
    defaultVisibility: "private",
    viewMode: "list",
    sortBy: "date",
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<FilesStaffPrefs> | null;
    const area = parsed?.defaultArea ?? fallback.defaultArea;
    return {
      defaultArea: area,
      defaultVisibility: parsed?.defaultVisibility ?? defaultVisibilityForArea(area),
      viewMode: parsed?.viewMode === "grid" ? "grid" : "list",
      sortBy:
        parsed?.sortBy === "name" || parsed?.sortBy === "size" || parsed?.sortBy === "date"
          ? parsed.sortBy
          : "date",
    };
  } catch {
    return fallback;
  }
}

export function writeFilesPrefs(prefs: FilesStaffPrefs) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
