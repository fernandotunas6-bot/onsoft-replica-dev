import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import type { SchoolFileDetail } from "@/features/arquivos/file-detail";
import { FileKindIcon, initialsFromName } from "@/features/arquivos/FileKindIcon";
import {
  fileActionLabels,
  fileAreaMeta,
  fileCategoryMeta,
  fileKindMeta,
  fileMyAccessMeta,
  fileVisibilityMeta,
  formatFileActivityLine,
  formatFileSize,
  formatFileWhen,
} from "@/features/arquivos/kinds";
import { resolveFileBlob, resolveFileUrl } from "@/features/arquivos/resolve-file";
import {
  getSchoolFileDetail,
  listSchoolFileActivity,
  logSchoolFileEvent,
} from "@/features/arquivos/server";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { formatIsoDay } from "@/features/finance/student-finance-summary";
import { canReadStudentSection } from "@/features/students/student-sections";
import { moduleIcons } from "@/lib/app-icons";
import { publicErrorMessage } from "@/lib/public-error";
import { toast } from "@/lib/toast";

/**
 * Página de um ficheiro (SIGA Context Engine, contexto Documentos e Arquivos):
 * os dados do ficheiro, a turma e o aluno a que está ligado e a auditoria. O
 * ficheiro só aparece se o servidor o devolver à conta, com as regras da lista
 * de Arquivos (`getSchoolFileDetail`); editar, mover e apagar continuam lá.
 */
export const Route = createFileRoute("/arquivos_/$fileId")({
  head: () => ({ meta: [{ title: "Ficheiro · SIGA" }] }),
  component: FilePage,
});

const SYSTEM_LOCKED_MSG =
  "Ficheiro do sistema: aparece na lista, mas o conteúdo só abre a quem tem permissão.";

function FilePage() {
  const { fileId } = Route.useParams();
  const account = useCurrentAccount();
  const allowed = canAccessPath("/arquivos", account.role, account.grants);
  const fileQuery = useQuery({
    queryKey: ["arquivos", "file", account.schoolId, fileId],
    queryFn: () => getSchoolFileDetail({ data: { id: fileId } }),
    enabled: allowed,
    retry: false,
  });
  const detail = fileQuery.data ?? null;

  // O menu do ficheiro (e a turma e o aluno dele) só entra com o ficheiro lido do servidor.
  const focus = useMemo(() => {
    if (!detail) return null;
    const relations = {
      ...(detail.classGroup ? { class: detail.classGroup.id } : {}),
      ...(detail.student ? { student: detail.student.id } : {}),
    };
    return {
      type: "file" as const,
      id: detail.file.id,
      label: detail.file.title || detail.file.name,
      schoolId: detail.file.schoolId,
      data: detail,
      ...(Object.keys(relations).length ? { relations } : {}),
    };
  }, [detail]);
  useDeclareEntityFocus(focus);

  const name = detail ? detail.file.title || detail.file.name : null;
  const crumbs = [
    { label: "Início", to: "/portal" },
    { label: "Arquivos", to: "/arquivos" },
    { label: name ?? "Ficheiro" },
  ];

  let body: ReactNode;
  if (!allowed) {
    body = (
      <EmptyState
        title="Sem acesso aos Arquivos"
        description="Os Arquivos da escola são da equipa da escola."
      />
    );
  } else if (fileQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">A abrir o ficheiro…</p>;
  } else if (fileQuery.isError) {
    body = (
      <EmptyState
        title="Não foi possível abrir o ficheiro"
        description={publicErrorMessage(fileQuery.error, "Tente de novo daqui a pouco.")}
      />
    );
  } else if (!detail) {
    body = (
      <EmptyState
        title="Ficheiro não encontrado"
        description="Este ficheiro não existe nesta escola ou não está disponível para esta conta."
        action={
          <Link to="/arquivos" className="text-sm font-semibold text-primary hover:underline">
            Ver os arquivos
          </Link>
        }
      />
    );
  } else {
    body = (
      <FileBody
        detail={detail}
        viewer={{ schoolId: account.schoolId, ownerUserId: account.id }}
        // Cada ligação segue as regras da página de destino.
        links={{
          classFolder: Boolean(detail.classGroup),
          student:
            detail.student &&
            canAccessPath(`/alunos/${detail.student.id}`, account.role, account.grants)
              ? { documents: canReadStudentSection("documentos", account.role, account.grants) }
              : null,
        }}
      />
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title={name ?? "Ficheiro"}
          icon={moduleIcons.documents}
          description="Os dados do ficheiro, a turma e o aluno a que está ligado e quem lhe mexeu."
          crumbs={crumbs}
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

function FileBody({
  detail,
  viewer,
  links,
}: {
  detail: SchoolFileDetail;
  viewer: { schoolId: string | null; ownerUserId: string };
  links: { classFolder: boolean; student: { documents: boolean } | null };
}) {
  const { file } = detail;
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const activityQuery = useQuery({
    queryKey: ["arquivos", "activity", "page", file.id],
    queryFn: () => listSchoolFileActivity({ data: { id: file.id, limit: 20 } }),
    retry: false,
  });
  const events = activityQuery.data?.events ?? [];

  const open = async () => {
    setBusy("open");
    try {
      const url = await resolveFileUrl(file, viewer);
      window.open(url, "_blank", "noopener,noreferrer");
      void logSchoolFileEvent({ data: { id: file.id, action: "opened" } }).catch(() => undefined);
    } catch (error) {
      toast.error(publicErrorMessage(error, "Não foi possível abrir o ficheiro."));
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    setBusy("download");
    try {
      const blob = await resolveFileBlob(file, viewer);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      void logSchoolFileEvent({ data: { id: file.id, action: "downloaded" } }).catch(
        () => undefined,
      );
    } catch (error) {
      toast.error(publicErrorMessage(error, "Não foi possível descarregar o ficheiro."));
    } finally {
      setBusy(null);
    }
  };

  const hasLinks = Boolean(detail.classGroup || detail.student || file.relatedUserName);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section
        aria-label="Ficheiro"
        className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <FileKindIcon kind={file.kind} visibility={file.visibility} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold [overflow-wrap:anywhere]">
              {file.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {fileKindMeta[file.kind].label} · {formatFileSize(file.sizeBytes)}
            </p>
          </div>
          {detail.contentOpen ? (
            <div className="flex basis-full flex-wrap gap-2 sm:basis-auto">
              <Button
                size="sm"
                className="gap-2"
                onClick={() => void open()}
                disabled={busy !== null}
              >
                <ExternalLink className="size-4" /> Abrir
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => void download()}
                disabled={busy !== null}
              >
                <Download className="size-4" /> Descarregar
              </Button>
            </div>
          ) : null}
        </div>
        {detail.contentOpen ? null : (
          <p className="mt-3 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            {SYSTEM_LOCKED_MSG}
          </p>
        )}
        {file.description ? (
          <p className="mt-4 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {file.description}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {file.title ? <Field label="Título">{file.title}</Field> : null}
          <Field label="Categoria">
            {file.category ? fileCategoryMeta[file.category].label : "Sem categoria"}
          </Field>
          {file.documentDate ? (
            <Field label="Data do documento">{formatIsoDay(file.documentDate)}</Field>
          ) : null}
          {file.referenceCode ? <Field label="Código">{file.referenceCode}</Field> : null}
          <Field label="Área">{fileAreaMeta[file.area].label}</Field>
          <Field label="Acesso">{fileVisibilityMeta[file.visibility].label}</Field>
          <Field label="O meu acesso">{fileMyAccessMeta[detail.myAccess].label}</Field>
          <Field label="Proprietário">{file.ownerName ?? "—"}</Field>
          <Field label="Carregado">{formatIsoDay(file.createdAt.slice(0, 10))}</Field>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Para renomear, mover, mudar o acesso ou apagar, use os{" "}
          <Link to="/arquivos" className="font-semibold text-primary hover:underline">
            Arquivos
          </Link>
          .
        </p>
      </section>

      <section
        aria-label="Ligado a"
        className="rounded-xl border border-border bg-card p-6 shadow-soft"
      >
        <h2 className="font-display text-base font-bold">Ligado a</h2>
        {hasLinks ? (
          <dl className="mt-3 space-y-3">
            {detail.classGroup ? (
              <Field label="Turma">
                <span className="block">{detail.classGroup.name}</span>
                {links.classFolder ? (
                  <Link
                    to="/arquivos"
                    search={{ turma: detail.classGroup.id }}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Pasta da turma
                  </Link>
                ) : null}
              </Field>
            ) : null}
            {detail.student ? (
              <Field label="Aluno">
                <span className="block">{detail.student.name ?? "Aluno"}</span>
                {links.student ? (
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
                    {links.student.documents ? (
                      <Link
                        to="/alunos/$studentId"
                        params={{ studentId: detail.student.id }}
                        search={{ secao: "documentos" }}
                        className="text-primary hover:underline"
                      >
                        Documentos do aluno
                      </Link>
                    ) : null}
                    <Link
                      to="/alunos/$studentId"
                      params={{ studentId: detail.student.id }}
                      className="text-primary hover:underline"
                    >
                      Ficha do aluno
                    </Link>
                  </span>
                ) : null}
              </Field>
            ) : null}
            {file.relatedUserName ? <Field label="Utilizador">{file.relatedUserName}</Field> : null}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Este ficheiro não está ligado a uma turma nem a uma pessoa.
          </p>
        )}
      </section>

      <section aria-label="Auditoria" className="space-y-3 lg:col-span-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Auditoria <span className="font-normal">· {events.length}</span>
        </h2>
        {activityQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {formatFileActivityLine({
              action: file.lastAction,
              actorName: file.lastActionByName ?? file.ownerName,
              at: file.lastActionAt,
              fallbackCreatedAt: file.createdAt,
              fallbackOwnerName: file.ownerName,
            })}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
            {events.map((event) => (
              <li key={event.id} className="flex min-w-0 items-start gap-3 p-4">
                <UserAvatar
                  url={event.actorAvatarUrl}
                  initials={initialsFromName(event.actorName)}
                  className="mt-0.5 size-7 bg-secondary text-[11px] font-bold"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {event.actorName ?? "Utilizador"}{" "}
                    {fileActionLabels[event.action] ?? event.action}
                  </p>
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    {formatFileWhen(event.createdAt)}
                    {event.detail ? ` · ${event.detail}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
