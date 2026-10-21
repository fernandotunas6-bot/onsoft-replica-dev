import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "./index";
import { useEffect } from "react";
import { z } from "zod";
import { useCurrentAccount } from "@/features/auth/use-current-account";

// style-check: route-exempt — o mesmo dashboard autenticado, com endereço independente do website público.
export const Route = createFileRoute("/portal")({
  validateSearch: z.object({ escola: z.string().max(50).optional() }),
  head: () => ({ meta: [{ title: "Portal académico · SIGA Plus" }] }),
  component: PortalPage,
});
function PortalPage() {
  const { escola } = Route.useSearch();
  const account = useCurrentAccount();
  const target = account.schools.find((school) => school.schoolSlug === escola && school.isActive);
  useEffect(() => {
    if (target && account.schoolId !== target.schoolId) account.setActiveSchoolId(target.schoolId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- membership and selected ID own the switch; the setter is recreated by the existing hook.
  }, [target?.schoolId, account.schoolId]);
  if (!escola) return <Dashboard />;
  if (account.profile.isPending || (target && account.schoolId !== target.schoolId))
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        A abrir o portal da escola…
      </p>
    );
  if (!target)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">Esta conta não tem acesso a esta escola.</h1>
        <p className="text-sm text-muted-foreground">
          Utilize uma conta vinculada à instituição ou entre no portal da sua escola.
        </p>
        <a className="text-primary underline" href="/portal">
          Voltar ao meu portal
        </a>
      </main>
    );
  return <Dashboard />;
}
