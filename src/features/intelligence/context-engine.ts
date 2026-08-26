import type { ModuleGrantMap } from "@/features/auth/access-policy";
import type { AppContext, EntityFocus } from "./types";

export function buildAppContext(params: {
  userId: string;
  role: string;
  grants: ModuleGrantMap;
  pathname: string;
  focusedEntity: EntityFocus | null;
}): AppContext {
  return {
    userId: params.userId,
    role: params.role,
    grants: params.grants,
    pathname: params.pathname,
    focusedEntity: params.focusedEntity,
  };
}
