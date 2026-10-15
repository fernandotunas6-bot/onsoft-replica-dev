import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, FolderOpen, Link2Off, Paperclip } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { canWriteModule } from "@/features/auth/access-policy";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { cn } from "@/lib/utils";
import { sqlApplyHint } from "@/lib/sql-doc-hint";
import { PickFileButton } from "./PickFileButton";
import { canAccessFileContent, formatFileSize } from "./kinds";
import { listLocalFiles, patchLocalFileMeta } from "./local-store";
import { resolveFileBlob, resolveFileUrl } from "./resolve-file";
import type { SchoolFileRecord } from "./schemas";
import { schoolFileShareText } from "./share-text";
import { linkSchoolFileToClass, listSchoolFiles } from "./server";

export { schoolFileShareText } from "./share-text";

const SYSTEM_LOCKED_MSG =
  "Ficheiro do sistema — visível, mas o conteúdo está oculto sem permissão.";

async function downloadRecord(file: SchoolFileRecord) {
  const blob = await resolveFileBlob(file);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ClassMaterialsPanel({
  classGroupId,
  classLabel,
  className,
}: {
  classGroupId: string;
  classLabel?: string;
  className?: string;
}) {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const installed = useInstalledIntegrations();
  const canManage = canWriteModule(account.role, "arquivos");
  const whatsappOn = installed.hasCapability("whatsapp.class_groups");

  const remoteQuery = useQuery({
    queryKey: ["arquivos", "turma", classGroupId],
    queryFn: () =>
      listSchoolFiles({
        data: { classGroupId, limit: 24 },
      }),
    staleTime: 30_000,
  });

  const localQuery = useQuery({
    queryKey: ["arquivos", "local-turma", remoteQuery.data?.schoolId, account.id, classGroupId],
    enabled: Boolean(remoteQuery.data?.schoolId && account.id),
    queryFn: () =>
      listLocalFiles({
        schoolId: remoteQuery.data!.schoolId,
        ownerUserId: account.id,
        classGroupId,
        limit: 24,
      }),
    staleTime: 15_000,
  });

  const files = (() => {
    const remote = remoteQuery.data?.files ?? [];
    const local = localQuery.data ?? [];
    const seen = new Set(remote.map((item) => item.id));
    return [...remote, ...local.filter((item) => !seen.has(item.id))].slice(0, 24);
  })();

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["arquivos", "turma", classGroupId] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "local-turma"] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["arquivos", "local"] }),
    ]);
  };

  const attach = async (file: SchoolFileRecord) => {
    try {
      await patchLocalFileMeta(file.id, { classGroupId });
      const result = await linkSchoolFileToClass({
        data: { id: file.id, classGroupId },
      });
      if (result.localOnly) {
        toast.message("Ligado neste dispositivo", {
          description: sqlApplyHint("premium"),
        });
      } else {
        toast.success("Material ligado à turma");
      }
      await refresh();
    } catch (error) {
      toast.error("Não foi possível anexar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const detach = async (file: SchoolFileRecord) => {
    try {
      await patchLocalFileMeta(file.id, { classGroupId: null });
      await linkSchoolFileToClass({ data: { id: file.id, classGroupId: null } });
      toast.success("Material removido da turma");
      await refresh();
    } catch (error) {
      toast.error("Não foi possível desligar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const copyRef = async (file: SchoolFileRecord) => {
    const text = schoolFileShareText(file, classLabel);
    await navigator.clipboard.writeText(text);
    toast.success("Referência copiada");
  };

  const shareWhatsApp = async (file: SchoolFileRecord) => {
    const text = schoolFileShareText(file, classLabel);
    await navigator.clipboard.writeText(text);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={cn("mt-4 rounded-xl border border-border bg-secondary/30 p-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Paperclip className="size-3.5" />
          Materiais{classLabel ? ` · ${classLabel}` : ""}
        </p>
        {canManage ? (
          <PickFileButton
            label="Anexar"
            area="escola"
            size="sm"
            variant="outline"
            onPick={(file) => void attach(file)}
          >
            <FolderOpen className="size-3.5" />
            Anexar
          </PickFileButton>
        ) : null}
      </div>
      {remoteQuery.isLoading ? (
        <p className="mt-2 text-xs text-muted-foreground">A carregar…</p>
      ) : files.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Sem materiais. Anexe um PDF, Word, Excel ou imagem da biblioteca.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {files.map((file) => {
            const contentOpen = canAccessFileContent(file, account.id, account.role);
            return (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 text-sm"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!contentOpen}
                  title={contentOpen ? undefined : SYSTEM_LOCKED_MSG}
                  onClick={() => {
                    if (!contentOpen) {
                      toast.error(SYSTEM_LOCKED_MSG);
                      return;
                    }
                    void resolveFileUrl(file)
                      .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
                      .catch((error: Error) => toast.error(error.message));
                  }}
                >
                  {file.name}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    {formatFileSize(file.sizeBytes)}
                    {file.isSystem && !contentOpen ? " · Protegido" : ""}
                  </span>
                </button>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    title="Copiar referência"
                    onClick={() =>
                      void copyRef(file).catch((error: Error) => toast.error(error.message))
                    }
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  {whatsappOn ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] font-semibold"
                      onClick={() =>
                        void shareWhatsApp(file).catch((error: Error) => toast.error(error.message))
                      }
                    >
                      WA
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={!contentOpen}
                    title={contentOpen ? undefined : SYSTEM_LOCKED_MSG}
                    onClick={() => {
                      if (!contentOpen) {
                        toast.error(SYSTEM_LOCKED_MSG);
                        return;
                      }
                      void downloadRecord(file).catch((error: Error) => toast.error(error.message));
                    }}
                  >
                    <Download className="size-3.5" />
                  </Button>
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => void detach(file)}
                    >
                      <Link2Off className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Selector + materiais para as turmas do professor (sem duplicar por disciplina). */
export function TeacherClassMaterialsBlock({
  classes,
}: {
  classes: Array<{ id: string; name: string }>;
}) {
  const unique = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of classes) map.set(item.id, item.name);
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [classes]);
  const [selectedId, setSelectedId] = useState(unique[0]?.id ?? "");

  useEffect(() => {
    if (!unique.some((item) => item.id === selectedId)) {
      setSelectedId(unique[0]?.id ?? "");
    }
  }, [selectedId, unique]);

  if (unique.length === 0) return null;
  const selected = unique.find((item) => item.id === selectedId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="h-9 min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Turma dos materiais"
        >
          {unique.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <Button asChild size="sm" variant="outline">
          <Link to="/arquivos" search={{ turma: selectedId }}>
            Biblioteca
          </Link>
        </Button>
      </div>
      {selected ? (
        <ClassMaterialsPanel
          classGroupId={selected.id}
          classLabel={selected.name}
          className="mt-0"
        />
      ) : null}
    </div>
  );
}
