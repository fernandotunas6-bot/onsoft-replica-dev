import { AsyncLocalStorage } from "node:async_hooks";

// Only the framework's cookie accessor is needed by the legacy Sga helpers.
// Mobile always passes school explicitly. This adapter still preserves proper
// per-request isolation if a helper consults the active-school cookie.
export const requestContext = new AsyncLocalStorage<Request>();
export function getCookie(name: string): string | undefined {
  const request = requestContext.getStore();
  if (!request) throw new Error("No active HTTP request");
  const pair = (request.headers.get("cookie") || "")
    .split(";")
    .find((part) => part.trim().split("=", 1)[0] === name);
  if (!pair) return undefined;
  const value = pair.trim().slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
