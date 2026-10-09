import type { Gateway } from "../domain/model";
import { ApiGateway } from "./api";

/**
 * API integration is opt-in at build time. The public standalone Pages preview
 * must never infer institutional authentication from the hostname or a query.
 * A missing/unrecognised value leaves the existing explicit demo flow intact.
 */
export function institutionalGateway(mode: string | undefined): Gateway | undefined {
  return mode === "institutional" ? new ApiGateway() : undefined;
}
