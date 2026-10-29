import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import {
  TEACHER_DOCUMENTS, TEACHER_DOCUMENT_LEVELS,
  parseTeacherDocumentPolicy, type TeacherDocumentCode,
  type TeacherDocumentLevel, type TeacherDocumentPolicy,
} from "./teacher-documents-policy";
import {
  getTeacherDocumentPolicy, setTeacherDocumentPolicy,
} from "./teacher-documents-settings-server";

export function TeacherDocumentsSettingsPanel() {
  const account = useCurrentAccount();
  const { school } = useSchoolSettings();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["school", "teacher-document-policy", account.schoolId],
    queryFn: () => getTeacherDocumentPolicy(),
    enabled: Boolean(account.schoolId),
    retry: false,
  });
  const [draft, setDraft] = useState<TeacherDocumentPolicy | null>(null);
  const [scope, setScope] = useState<TeacherDocumentLevel | "all">("all");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(parseTeacherDocumentPolicy(query.data));
  }, [query.data]);
  const contextLevels = school?.pedagogy?.teachingLevels ?? [];
  const levels = useMemo(() => TEACHER_DOCUMENT_LEVELS.filter(
    (level) => contextLevels.length === 0 || contextLevels.includes(level.id),
  ), [contextLevels]);
  const selected = scope === "all" ? (draft?.required ?? []) : (draft?.requiredByLevel[scope] ?? []);
  const toggleRequired = (code: TeacherDocumentCode, checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      const values = scope === "all" ? current.required : (current.requiredByLevel[scope] ?? []);
      const updated = checked
        ? [...new Set([...values, code])]
        : values.filter((item) => item !== code);
      return scope === "all"
        ? { ...current, required: updated }
        : { ...current, requiredByLevel: { ...current.requiredByLevel, [scope]: updated } };
    });
  };
  const groups = [...new Set(TEACHER_DOCUMENTS.map((doc) => doc.group))];

  if (query.isLoading || !draft) {
    return <p className="text-sm text-muted-foreground">{query.isError
      ? "Não foi possível consultar os requisitos da escola." : "A carregar os requisitos…"}</p>;
  }
  return <section className="space-y-5">
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileCheck2 className="size-5" /> Documentos de recrutamento
      </h2>
      <p className="text-sm text-muted-foreground">
        {school?.name ?? "Escola activa"} · Defina os documentos que serão solicitados aos novos professores.
        Os documentos específicos de cada nível acumulam-se com os obrigatórios gerais.
      </p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4">
      <div>
        <p className="text-sm font-semibold">Exigir documentos aos professores desta escola</p>
        <p className="text-xs text-muted-foreground">
          Quando activo, o perfil apresenta as pendências após o cadastro e durante a contratação.
        </p>
      </div>
      <Switch
        aria-label="Activar documentos obrigatórios para professores"
        checked={draft.enabled}
        onCheckedChange={(enabled) => setDraft((current) => current && ({ ...current, enabled }))}
      />
    </div>
    <label className="block space-y-2 text-sm">
      <span className="font-semibold">Aplicar obrigatoriedade</span>
      <select
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm sm:max-w-md"
        aria-label="Nível de ensino ao qual aplicar a obrigatoriedade"
        value={scope} onChange={(event) => setScope(event.target.value as TeacherDocumentLevel | "all")}
      >
        <option value="all">A todos os professores (requisitos gerais)</option>
        {levels.map((level) => <option key={level.id} value={level.id}>Apenas no {level.label}</option>)}
      </select>
    </label>
    <p className="text-xs text-muted-foreground">
      {scope === "all"
        ? "Estes documentos serão exigidos em qualquer nível configurado nesta instituição."
        : "Estes documentos são adicionais aos requisitos gerais. A escola pode retirar ou acrescentar livremente."}
    </p>
    <div className="space-y-4">
      {groups.map((group) => <div key={group} className="overflow-hidden rounded-xl border border-border">
        <h3 className="bg-muted/30 px-4 py-3 text-sm font-semibold">{group}</h3>
        <div className="divide-y divide-border">
          {TEACHER_DOCUMENTS.filter((doc) => doc.group === group).map((doc) => (
            <label key={doc.code} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
              <Checkbox
                checked={selected.includes(doc.code)}
                onCheckedChange={(value) => toggleRequired(doc.code, value === true)}
                disabled={!draft.enabled}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{doc.label}</span>
                <span className="block text-xs text-muted-foreground">{doc.note}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {selected.includes(doc.code) ? "Obrigatório" : "Opcional"}
              </span>
            </label>
          ))}
        </div>
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">
      A exigência é da escola e não substitui os requisitos legais aplicáveis. Certificados, documentos
      médicos e identificação ficam reservados à Secretaria e à Administração. Um documento recebido
      ainda requer validação antes de ser considerado comprovado.
    </p>
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const saved = await setTeacherDocumentPolicy({
              data: { enabled: draft.enabled, required: draft.required, requiredByLevel: draft.requiredByLevel },
            });
            queryClient.setQueryData(["school", "teacher-document-policy", account.schoolId], saved);
            await queryClient.invalidateQueries({ queryKey: ["teacher", "documents"] });
            toast.success("Requisitos de documentos actualizados nesta escola.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível guardar os requisitos.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <Save className="mr-2 size-4" /> {saving ? "A guardar…" : "Guardar requisitos"}
      </Button>
      <span className="text-xs text-muted-foreground">As novas regras não apagam documentos já entregues.</span>
    </div>
  </section>;
}
