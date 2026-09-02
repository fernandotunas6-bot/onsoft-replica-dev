export type LauncherSectionId =
  | "workspace"
  | "integrations"
  | "payments"
  | "communication"
  | "academic"
  | "calendar"
  | "lessons"
  | "state";

export type LauncherTarget =
  | { type: "route"; to: string; search?: Record<string, string> }
  | { type: "settings"; panelId: string }
  | { type: "ics" };

export type LauncherApp = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  section: LauncherSectionId;
  mark: string;
  target: LauncherTarget;
  catalogId?: string;
};
