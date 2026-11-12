import type { ModuleGrantMap } from "@/features/auth/access-policy";
import type { AppContext, EntityFocus } from "./types";

export function buildAppContext(params: {
  userId: string;
  role: string;
  grants: ModuleGrantMap;
  pathname: string;
  focusedEntity: EntityFocus | null;
  /** Escola activa da conta. Uma entidade de outra escola nunca entra no contexto. */
  schoolId?: string | null;
}): AppContext {
  const { focusedEntity, schoolId } = params;
  // Ao trocar de escola a página ainda pode declarar a entidade anterior durante
  // um render: o painel não deve mostrar relações de outra instituição.
  const sameSchool = !focusedEntity || !schoolId || focusedEntity.schoolId === schoolId;
  return {
    userId: params.userId,
    role: params.role,
    grants: params.grants,
    pathname: params.pathname,
    focusedEntity: sameSchool ? focusedEntity : null,
  };
}
