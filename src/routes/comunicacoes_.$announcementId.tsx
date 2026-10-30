import { useMemo, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  announcementStatusKey,
  audienceName,
  channelName,
  estadoLabel,
} from "@/features/communications/labels";
import {
  getSchoolAnnouncement,
  type SchoolAnnouncementDetail,
} from "@/features/communications/server";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { moduleIcons } from "@/lib/app-icons";
import { publicErrorMessage } from "@/lib/public-error";

/**
 * Página do comunicado (SIGA Context Engine, contexto Comunicações): o aviso por
 * inteiro, o público, o canal e as datas. O comunicado só aparece se o servidor o
 * devolver (`getSchoolAnnouncement`, com as regras da lista); redigir, editar,
 * arquivar e reenviar continuam na lista de comunicados.
 */
export const Route = createFileRoute("/comunicacoes_/$announcementId")({
  head: () => ({ meta: [{ title: "Comunicado · SIGA" }] }),
  component: AnnouncementPage,
});

/** «2026-10-30» (agendado, sem hora) ou um instante ISO → «30/10/2026». */
function dayLabel(value: string | null): string | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("pt-PT");
}

function AnnouncementPage() {
  const { announcementId } = Route.useParams();
  const account = useCurrentAccount();
  const allowed = canAccessPath("/comunicacoes", account.role, account.grants);
  const announcementQuery = useQuery({
    queryKey: ["communications", "announcement", announcementId],
    queryFn: () => getSchoolAnnouncement({ data: { id: announcementId } }),
    enabled: allowed,
    retry: false,
  });
  const announcement = announcementQuery.data ?? null;

  // O menu do comunicado só entra com o comunicado lido do servidor.
  const focus = useMemo(
    () =>
      announcement
        ? {
            type: "announcement" as const,
            id: announcement.id,
            label: announcement.title || "Comunicado",
            schoolId: announcement.schoolId,
            data: announcement,
          }
        : null,
    [announcement],
  );
  useDeclareEntityFocus(focus);

  const backToList = (
    <Link to="/comunicacoes" className="text-sm font-semibold text-primary hover:underline">
      Ver os comunicados
    </Link>
  );

  let body: ReactNode;
  if (!allowed) {
    body = (
      <EmptyState
        title="Sem acesso às comunicações"
        description="Os comunicados da escola abrem-se a quem tem acesso às Comunicações."
      />
    );
  } else if (announcementQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">A abrir o comunicado…</p>;
  } else if (announcementQuery.isError) {
    body = (
      <EmptyState
        title="Não foi possível abrir o comunicado"
        description={publicErrorMessage(announcementQuery.error, "Tente de novo daqui a pouco.")}
      />
    );
  } else if (!announcement) {
    body = (
      <EmptyState
        title="Comunicado não encontrado"
        description="Este comunicado não existe, foi arquivado ou não é para a sua conta."
        action={backToList}
      />
    );
  } else {
    body = (
      <AnnouncementBody
        announcement={announcement}
        canManage={account.role === "Administrador" || account.role === "Secretaria"}
      />
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title={announcement?.title || "Comunicado"}
          icon={moduleIcons.communications}
          description="O comunicado por inteiro, para quem foi, por que canal e quando."
          crumbs={[
            { label: "Início", to: "/portal" },
            { label: "Comunicações", to: "/comunicacoes" },
            { label: announcement?.title || "Comunicado" },
          ]}
        />
        {body}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function AnnouncementBody({
  announcement,
  canManage,
}: {
  announcement: SchoolAnnouncementDetail;
  canManage: boolean;
}) {
  const published = dayLabel(announcement.published_at);
  const scheduled = dayLabel(announcement.scheduled_for);
  const created = dayLabel(announcement.created_at);
  const updated = dayLabel(announcement.updated_at);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section
        aria-label="Comunicado"
        className="min-w-0 rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-base font-bold [overflow-wrap:anywhere]">
            {announcement.title || "Comunicado"}
          </h2>
          <StatusBadge
            status={announcementStatusKey(announcement.status)}
            label={estadoLabel[announcement.status] ?? announcement.status}
          />
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
          {announcement.body}
        </p>
      </section>

      <section
        aria-label="Envio"
        className="min-w-0 rounded-xl border border-border bg-card p-6 shadow-soft"
      >
        <h2 className="font-display text-base font-bold">Envio</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-1">
          <Field label="Público">{audienceName(announcement.audience)}</Field>
          <Field label="Canal">{channelName(announcement.channel)}</Field>
          {published ? <Field label="Publicado">{published}</Field> : null}
          {announcement.status === "scheduled" && scheduled ? (
            <Field label="Agendado para">{scheduled}</Field>
          ) : null}
          {created ? <Field label="Criado">{created}</Field> : null}
          {updated && updated !== created ? <Field label="Alterado">{updated}</Field> : null}
        </dl>
        {canManage ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Editar, arquivar e reenviar fazem-se na{" "}
            <Link to="/comunicacoes" className="font-semibold text-primary hover:underline">
              lista de comunicados
            </Link>
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}
