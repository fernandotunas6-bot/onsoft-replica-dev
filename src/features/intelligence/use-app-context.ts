import { useRouterState } from "@tanstack/react-router";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { buildAppContext } from "./context-engine";
import { useEntityFocus } from "./entity-focus-context";
import type { AppContext } from "./types";

export function useAppContext(): AppContext {
  const account = useCurrentAccount();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { focusedEntity } = useEntityFocus();

  return buildAppContext({
    userId: account.id,
    role: account.role,
    grants: account.grants,
    pathname,
    focusedEntity,
  });
}
