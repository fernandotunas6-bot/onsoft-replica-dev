import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import VirtualClassroomCalendarSection from "@/features/virtual-classroom/VirtualClassroomCalendarSection";

export const Route = createFileRoute("/aulas-virtuais")({
  head: () => ({
    meta: [
      { title: "Aulas Virtuais · SIGA Plus" },
      { name: "description", content: "Aulas virtuais autorizadas da escola." },
    ],
  }),
  component: VirtualClassroomsPage,
});

function VirtualClassroomsPage() {
  const account = useCurrentAccount();
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Aulas Virtuais"
          description="Consulte as sessões das suas turmas e acompanhe os horários."
        />
        {account.schoolId ? (
          <VirtualClassroomCalendarSection schoolId={account.schoolId} />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Seleccione uma escola activa para consultar as aulas virtuais.
          </p>
        )}
      </div>
    </AppShell>
  );
}
