import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FolderOpen, Upload } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilePickerModal } from "@/features/arquivos/FilePickerModal";
import type { SchoolFileRecord } from "@/features/arquivos/schemas";
import { TEACHER_DOCUMENTS, type TeacherDocumentCode } from "./teacher-documents-policy";
import { attachTeacherDocument, getTeacherDocuments } from "./teacher-documents-server";

export function TeacherDocumentsPanel({
  teacherId,
  personId,
  schoolId,
  canManage,
}: {
  teacherId: string;
  personId: string | undefined | null;
  schoolId: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<TeacherDocumentCode>("bi");
  const [saving, setSaving] = useState(false);
  const queryKey = ["teacher", "documents", schoolId, teacherId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getTeacherDocuments({ data: { teacherId } }),
    enabled: Boolean(teacherId && schoolId),
    retry: false,
  });
  const items = query.data?.items ?? [];
  const required = items.filter((item) => item.required);
  const missing = required.filter((item) => !item.received);
  const received = items.filter((item) => item.received);
  const canUpload = canManage && Boolean(personId);

  const onPick = async (file: SchoolFileRecord) => {
    if (
      !personId ||
      file.relatedPersonId !== personId ||
      file.area !== "secretaria" ||
      file.visibility !== "private" ||
      file.storageBackend !== "sga"
    ) {
      toast.error("Escolha um arquivo privado associado a este professor na área Secretaria.");
      return;
    }
    setSaving(true);
    try {
      await attachTeacherDocument({
        data: { teacherId, documentCode: selectedCode, fileId: file.id },
      });
      await queryClient.invalidateQueries({ queryKey });
      toast.success("Documento recebido e associado ao processo do professor.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível associar o documento.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileCheck2 className="size-4" /> Processo documental do professor
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Documentos reservados, associados à pessoa nesta escola e separados dos materiais de
              aula.
            </p>
          </div>
          {query.data?.policyEnabled ? (
            <Badge variant={missing.length ? "outline" : "default"}>
              {missing.length
                ? `${missing.length} obrigatório(s) em falta`
                : "Requisitos recebidos"}
            </Badge>
          ) : (
            <Badge variant="outline">Exigência desactivada</Badge>
          )}
        </div>
        {query.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">A consultar os documentos…</p>
        ) : query.isError ? (
          <p className="mt-4 text-sm text-destructive">
            Não foi possível consultar os documentos. Verifique as permissões.
          </p>
        ) : (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              {received.length} tipo(s) de documento recebido(s) · {required.length} obrigatório(s).
              A entrega não significa validação de autenticidade.
            </p>
            <ul className="mt-3 divide-y divide-border">
              {items.map((item) => (
                <li key={item.code} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.group}
                      {item.required ? " · Necessário nesta escola/nível" : " · Opcional"}
                    </p>
                  </div>
                  <Badge variant={item.received ? "secondary" : "outline"}>
                    {item.received ? "Recebido" : item.required ? "Em falta" : "Não entregue"}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {canUpload ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-sm font-semibold">Adicionar documento ao processo</h3>
          <label className="block max-w-md space-y-1 text-sm">
            <span>Tipo de documento</span>
            <select
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              aria-label="Tipo de documento do professor"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value as TeacherDocumentCode)}
            >
              {TEACHER_DOCUMENTS.map((doc) => (
                <option key={doc.code} value={doc.code}>
                  {doc.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" disabled={saving} onClick={() => setPickerOpen(true)}>
            <Upload className="mr-2 size-4" /> Seleccionar ou carregar documento
          </Button>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <FolderOpen className="size-4" /> O ficheiro deve estar na área privada da Secretaria,
            associado a esta pessoa. A selecção é validada no servidor.
          </p>
          <FilePickerModal
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            area="secretaria"
            initialRelatedPersonId={personId ?? undefined}
            onPick={(file) => void onPick(file)}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Para consultar ficheiros sensíveis, use as permissões da Secretaria. O professor vê apenas o
        estado do seu processo; outros utilizadores não podem abrir estes documentos.
      </p>
    </section>
  );
}
