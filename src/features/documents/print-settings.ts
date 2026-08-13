type JsonMap = Record<string, unknown>;

export type PrintSettings = {
  overrides?: Record<string, string>;
  issue?: string;
  byType?: Record<string, string>;
};

export function parsePrintSettings(value: unknown): PrintSettings {
  if (!value || typeof value !== "object") return {};
  const raw = value as JsonMap;
  const overrides =
    raw["overrides"] && typeof raw["overrides"] === "object"
      ? Object.fromEntries(
          Object.entries(raw["overrides"] as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  const byType =
    raw["byType"] && typeof raw["byType"] === "object"
      ? Object.fromEntries(
          Object.entries(raw["byType"] as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  const issue = typeof raw["issue"] === "string" ? raw["issue"] : undefined;
  return {
    overrides,
    byType,
    ...(issue ? { issue } : {}),
  };
}
