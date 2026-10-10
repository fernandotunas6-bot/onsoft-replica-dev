import type { Gateway } from "../domain/model";
import { ApiGateway, type SessionTransport } from "./api";

/**
 * API integration is opt-in at build time. The public standalone Pages preview
 * must never infer institutional authentication from the hostname or a query.
 * A missing/unrecognised value leaves the existing explicit demo flow intact.
 */
export function institutionalGateway(
  mode: string | undefined,
  transport?: SessionTransport,
): Gateway | undefined {
  if (mode !== "institutional") return undefined;
  if (!transport) throw new Error("A sessão institucional Supabase ainda não foi ligada.");
  return new ApiGateway("/api/mobile-v4", transport);
}
