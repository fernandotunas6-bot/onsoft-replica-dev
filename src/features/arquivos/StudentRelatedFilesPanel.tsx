import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyLibraryPhotoToPerson } from "./apply-person-photo";
import { FileKindIcon } from "./FileKindIcon";
import { fileCategoryMeta, formatFileSize, formatFileWhen } from "./kinds";
import { isImageFileKind } from "./resolve-file";
import { listSchoolFiles } from "./server";

const FINANCE_CATEGORIES = new Set(["recibo", "talao", "fatura"]);

export function StudentRelatedFilesPanel({
  personId,
  schoolId,
  studentId,
}: {
  personId: string;
  schoolId: string;
  studentId: string;
}) {
  const queryClient = useQueryClient();
  const filesQuery = useQuery({
    queryKey: ["arquivos", "student-related", personId],
    queryFn: () =>
      listSchoolFiles({
        data: { relatedPersonId: personId, limit: 24 },
      }),
    staleTime: 20_000,
  });

  const files = filesQuery.data?.files ?? [];
  const photos = files.filter((file) => file.kind === "png" || file.kind === "jpeg");
  const financeCount = files.filter(
    (file) => file.category && FINANCE_CATEGORIES.has(file.category),
  ).length;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">Arquivos do aluno</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fotografias, recibos, talões e documentos da biblioteca ligados a este estudante.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/arquivos" search={{ pessoa: personId }}>
            <FolderOpen className="size-4" /> Biblioteca
          </Link>
        </Button>
      </div>

      {filesQuery.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> A carregar arquivos…
        </div>
      ) : files.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ainda não há ficheiros relacionados. Carregue uma fotografia na biblioteca com a
          categoria <strong>Fotografia</strong> e este aluno, ou use o botão{" "}
          <strong>Foto</strong> no cabeçalho da ficha. Recibos e talões da tesouraria
          arquivam-se automaticamente.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {files.map((file) => {
            const categoryLabel = file.category
              ? fileCategoryMeta[file.category]?.label
              : null;
            return (
              <li
                key={file.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"
              >
                <FileKindIcon kind={file.kind} className="size-8 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {file.title?.trim() || file.name}
                    {categoryLabel ? (
                      <span className="ml-2 text-xs font-normal text-primary">{categoryLabel}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {file.referenceCode ? (
                      <span className="font-mono">{file.referenceCode}</span>
                    ) : null}
                    {file.referenceCode ? " · " : ""}
                    {formatFileSize(file.sizeBytes)}
                    {file.createdAt ? ` · ${formatFileWhen(file.createdAt)}` : ""}
                  </p>
                </div>
                {isImageFileKind(file.kind) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      void (async () => {
                        try {
                          await applyLibraryPhotoToPerson({
                            personId,
                            schoolId,
                            file,
                          });
                          await Promise.all([
                            queryClient.invalidateQueries({
                              queryKey: ["students", "profile", studentId],
                            }),
                            queryClient.invalidateQueries({
                              queryKey: ["arquivos", "student-related", personId],
                            }),
                          ]);
                          toast.success("Foto de perfil actualizada");
                        } catch (error) {
                          toast.error("Não foi possível aplicar a foto", {
                            description:
                              error instanceof Error ? error.message : "Tente novamente.",
                          });
                        }
                      })();
                    }}
                  >
                    <ImagePlus className="size-3.5" /> Usar no perfil
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {photos.length > 0 || financeCount > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {photos.length > 0
            ? `${photos.length} fotografia${photos.length === 1 ? "" : "s"}`
            : null}
          {photos.length > 0 && financeCount > 0 ? " · " : ""}
          {financeCount > 0
            ? `${financeCount} documento${financeCount === 1 ? "" : "s"} financeiro${financeCount === 1 ? "" : "s"}`
            : null}
          {" na biblioteca deste aluno."}
        </p>
      ) : null}
    </section>
  );
}
