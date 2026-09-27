import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { isTwoFactorRequiredMessage, TWO_FACTOR_SETUP_PATH } from "@/lib/two-factor-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  candidacyProcessNumber,
  enrollmentVisibleFieldOptions,
  type EnrollmentVisibleField,
} from "@/features/enrollment/schemas";
import {
  decideEnrollmentApplication,
  getOrCreateEnrollmentForm,
  listEnrollmentApplications,
  updateEnrollmentForm,
} from "@/features/enrollment/server";
import { enrollStudentInClass, listAcademicDirectory } from "@/features/students/server";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { whatsappHref } from "@/features/integrations/actions";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { overlayTalao } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";

const fieldLabels: Record<EnrollmentVisibleField, string> = {
  birth_date: "Data de nascimento",
  sex: "Género",
  phone_primary: "Telefone",
  email: "Email",
  province: "Província",
  municipality: "Município",
  commune: "Comuna / localidade",
  address: "Morada",
  nif: "NIF",
  guardian_name: "Nome do encarregado",
  guardian_phone: "Telefone do encarregado",
  guardian_relationship: "Parentesco",
  notes: "Observações",
};

export function EnrollmentCampaignPanel() {
  const queryClient = useQueryClient();
  const installed = useInstalledIntegrations();
  const shareWhatsapp = installed.hasCapability("whatsapp.notices");
  const shareResend = installed.hasCapability("resend.send");
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const formQuery = useQuery({
    queryKey: ["enrollment", "campaign"],
    queryFn: () => getOrCreateEnrollmentForm(),
    retry: false,
  });
  const applicationsQuery = useQuery({
    queryKey: ["enrollment", "applications"],
    queryFn: () => listEnrollmentApplications({ data: { status: "all", limit: 30 } }),
    retry: false,
    enabled: Boolean(formQuery.data),
  });
  const directoryQuery = useQuery({
    queryKey: ["students", "academic-directory"],
    queryFn: () => listAcademicDirectory(),
    retry: false,
    enabled: Boolean(formQuery.data),
  });
  const classGroups = directoryQuery.data?.classGroups ?? [];
  const form = formQuery.data;
  useEffect(() => {
    if (typeof form?.is_open === "boolean") setIsOpen(form.is_open);
  }, [form?.is_open]);
  const publicUrl = useMemo(() => {
    if (!form?.slug || typeof window === "undefined") return "";
    return `${window.location.origin}/matricula/${form.slug}`;
  }, [form?.slug]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    const data = new FormData(event.currentTarget);
    const visibleFields = enrollmentVisibleFieldOptions.filter(
      (field) => data.get(`field_${field}`) === "on",
    );
    setSaving(true);
    try {
      await updateEnrollmentForm({
        data: {
          id: form.id,
          title: String(data.get("title") ?? ""),
          subtitle: String(data.get("subtitle") || "") || undefined,
          heroText: String(data.get("heroText") || "") || undefined,
          accentColor: String(data.get("accentColor") || "#1d4ed8"),
          logoUrl: String(data.get("logoUrl") || "") || undefined,
          isOpen,
          visibleFields,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["enrollment", "campaign"] });
      toast.success("Página de matrícula actualizada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (formQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A preparar o link público…</p>;
  }
  if (formQuery.isError || !form) {
    return (
      <p className="text-sm text-destructive">
        {formQuery.error instanceof Error
          ? formQuery.error.message
          : "Não foi possível carregar o formulário público."}
      </p>
    );
  }

  const visible = new Set(
    Array.isArray(form.visible_fields) ? (form.visible_fields as string[]) : [],
  );

  return (
    <form className="space-y-4" onSubmit={(event) => void save(event)}>
      <InstalledModuleTools module="comunicacoes" />
      <InstalledModuleTools module="documentos" />
      <div className="flex flex-wrap gap-2">
        <Button asChild type="button" variant="outline" size="sm">
          <a href="/documentos#modelos">Modelos de impressão</a>
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-secondary/40 p-3">
        <p className="text-xs font-semibold text-muted-foreground">Link público</p>
        <p className="mt-1 break-all font-mono text-xs">{publicUrl}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              void navigator.clipboard.writeText(publicUrl);
              toast.success("Link copiado.");
            }}
          >
            <Copy className="size-3.5" /> Copiar
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1" asChild>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Abrir
            </a>
          </Button>
          {shareWhatsapp && publicUrl ? (
            <Button type="button" size="sm" variant="outline" className="gap-1" asChild>
              <a
                href={whatsappHref("", `Matrícula ${form?.title ?? "SIGA"}: ${publicUrl}`)}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            </Button>
          ) : null}
          {shareResend && publicUrl ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${form?.title ?? "Matrícula SIGA"}\n\n${form?.hero_text ?? form?.subtitle ?? "Candidatura online."}\n\n${publicUrl}`,
                );
                toast.success("Texto copiado para e-mail Resend");
              }}
            >
              E-mail
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Título da página</Label>
          <Input id="title" name="title" defaultValue={form.title} required />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="subtitle">Subtítulo</Label>
          <Input id="subtitle" name="subtitle" defaultValue={form.subtitle ?? ""} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="heroText">Texto de apresentação</Label>
          <Input id="heroText" name="heroText" defaultValue={form.hero_text ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accentColor">Cor de destaque</Label>
          <Input id="accentColor" name="accentColor" defaultValue={form.accent_color} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="logoUrl">URL do logótipo</Label>
          <Input id="logoUrl" name="logoUrl" defaultValue={form.logo_url ?? ""} />
        </div>
      </div>

      <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <Link2 className="size-4 text-primary" /> Campanha aberta
        </span>
        <Switch checked={isOpen} onCheckedChange={setIsOpen} />
      </label>

      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Campos visíveis</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {enrollmentVisibleFieldOptions.map((field) => (
            <label key={field} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`field_${field}`}
                aria-label={`Mostrar o campo ${field}`}
                defaultChecked={visible.has(field)}
              />
              {fieldLabels[field]}
            </label>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={saving}>
        {saving ? "A guardar…" : "Guardar apresentação"}
      </Button>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Candidaturas</p>
        {classGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sem turmas no ano lectivo. Pode aceitar o candidato e colocá-lo na turma depois, em
            Alunos.
          </p>
        ) : null}
        {(applicationsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem candidaturas neste link.</p>
        ) : (
          <ul className="space-y-2">
            {(applicationsQuery.data ?? []).map((row) => (
              <ApplicationRow
                key={row.id}
                row={row}
                classGroups={classGroups}
                onChanged={async () => {
                  await queryClient.invalidateQueries({ queryKey: ["enrollment", "applications"] });
                  await queryClient.invalidateQueries({ queryKey: ["students"] });
                  await queryClient.invalidateQueries({
                    queryKey: ["academic", "pedagogical-workspace"],
                  });
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}

type ApplicationListRow = {
  id: string;
  full_name: string;
  processNumber?: string;
  status: string;
  student_id?: string | null;
  payload?: {
    person?: { full_name?: string; email?: string; phone_primary?: string };
    guardianName?: string;
    guardianPhone?: string;
  } | null;
  created_at?: string;
};

type ClassGroupRow = {
  id: string;
  name?: string | null;
  academic_year_id?: string | null;
};

function ApplicationRow({
  row,
  classGroups,
  onChanged,
}: {
  row: ApplicationListRow;
  classGroups: ClassGroupRow[];
  onChanged: () => Promise<void>;
}) {
  const [classGroupId, setClassGroupId] = useState(classGroups[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const { school, selectedYearLabel } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const selected = classGroups.find((group) => group.id === classGroupId);
  const contactPhone = row.payload?.guardianPhone || row.payload?.person?.phone_primary || "";
  const contactEmail = row.payload?.person?.email || "";
  const shareText = `Candidatura SIGA de ${row.full_name} (${applicationStatusLabel(row.status).toLowerCase()}).`;

  const printTalao = async (kind: "candidatura" | "matricula") => {
    const payload = row.payload ?? {};
    await issuePrintDocument({
      tipo: kind === "matricula" ? "Talão de matrícula" : "Talão de candidatura",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif ?? null,
        phone: school?.phone ?? null,
        email: school?.email ?? null,
        address: school?.address ?? null,
        directorName: school?.director_name ?? null,
        academicYear:
          selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || null,
      },
      student: {
        fullName: row.full_name,
        academicNumber: row.processNumber ?? candidacyProcessNumber(row.id, row.created_at),
        className: selected?.name ?? null,
      },
      overlay: overlayTalao({
        kind,
        fullName: payload.person?.full_name || row.full_name,
        process: row.processNumber ?? candidacyProcessNumber(row.id, row.created_at),
        ...(selected?.name ? { className: selected.name } : {}),
        ...(payload.guardianName ? { guardianName: payload.guardianName } : {}),
        ...(payload.guardianPhone ? { guardianPhone: payload.guardianPhone } : {}),
        ...(payload.person?.email ? { guardianEmail: payload.person.email } : {}),
        ...(row.created_at
          ? { submittedAt: new Date(row.created_at).toLocaleDateString("pt-AO") }
          : {}),
      }),
    });
  };

  const refresh = async (message: string) => {
    await onChanged();
    toast.success(message);
  };

  const accept = async (withClass: boolean) => {
    setBusy(true);
    try {
      await decideEnrollmentApplication({
        data: {
          applicationId: row.id,
          decision: "accepted",
          classGroupId: withClass && classGroupId ? classGroupId : undefined,
        },
      });
      await refresh(
        withClass && selected
          ? `Candidatura aceite e aluno colocado em ${selected.name ?? "turma"}.`
          : "Candidatura aceite. O aluno ficou como candidato até ser colocado numa turma.",
      );
      await printTalao(withClass ? "matricula" : "candidatura").catch(() => undefined);
    } catch (error) {
      showDecisionError(error, "Não foi possível aceitar.");
    } finally {
      setBusy(false);
    }
  };

  const placeInClass = async () => {
    if (!row.student_id || !selected?.academic_year_id) {
      toast.error("Seleccione uma turma com ano lectivo.");
      return;
    }
    setBusy(true);
    try {
      await enrollStudentInClass({
        data: {
          studentId: row.student_id,
          classGroupId: selected.id,
          academicYearId: selected.academic_year_id,
        },
      });
      await refresh(`Aluno colocado em ${selected.name ?? "turma"}.`);
      await printTalao("matricula").catch(() => undefined);
    } catch (error) {
      showDecisionError(error, "Não foi possível colocar na turma.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <span>
        <strong>{row.full_name}</strong>
        <span className="ml-2 text-xs text-muted-foreground">
          {applicationStatusLabel(row.status)}
        </span>
      </span>
      {row.status === "pending" ? (
        <span className="flex flex-wrap items-center gap-1">
          {classGroups.length > 0 ? (
            <select
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
              value={classGroupId}
              onChange={(event) => setClassGroupId(event.target.value)}
              aria-label={`Turma para ${row.full_name}`}
            >
              {classGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name ?? group.id}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void accept(classGroups.length > 0)}
          >
            {classGroups.length > 0 ? "Aceitar e matricular" : "Aceitar"}
          </Button>
          {classGroups.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void accept(false)}
            >
              Só candidato
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void printTalao("candidatura")}
          >
            Talão
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await decideEnrollmentApplication({
                  data: { applicationId: row.id, decision: "rejected" },
                });
                await refresh("Candidatura recusada.");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Não foi possível recusar.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Recusar
          </Button>
        </span>
      ) : row.status === "accepted" && row.student_id && classGroups.length > 0 ? (
        <span className="flex flex-wrap items-center gap-1">
          <select
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
            value={classGroupId}
            onChange={(event) => setClassGroupId(event.target.value)}
            aria-label={`Colocar ${row.full_name} na turma`}
          >
            {classGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name ?? group.id}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void placeInClass()}
          >
            Colocar na turma
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void printTalao("matricula")}
          >
            Talão
          </Button>
        </span>
      ) : row.status !== "pending" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void printTalao(row.status === "accepted" ? "matricula" : "candidatura")}
        >
          Talão
        </Button>
      ) : null}
      {whatsappOn || resendOn ? (
        <span className="flex flex-wrap items-center gap-1">
          {whatsappOn ? (
            <Button type="button" size="sm" variant="ghost" asChild>
              <a href={whatsappHref(contactPhone, shareText)} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </Button>
          ) : null}
          {resendOn ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  contactEmail ? `${shareText}\n${contactEmail}` : shareText,
                );
                toast.success("Texto da candidatura copiado para e-mail Resend");
              }}
            >
              E-mail
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

/**
 * Sem 2FA a base recusa criar ou matricular o aluno (e a candidatura fica
 * pendente). O aviso leva directamente à activação, em vez de só informar.
 */
function showDecisionError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (isTwoFactorRequiredMessage(message)) {
    toast.error(message, {
      description: "A candidatura continua pendente. Active o 2FA e volte a aceitar.",
      duration: 12_000,
      action: {
        label: "Activar 2FA",
        onClick: () => window.location.assign(TWO_FACTOR_SETUP_PATH),
      },
    });
    return;
  }
  toast.error(message);
}

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceite",
  rejected: "Recusada",
};

function applicationStatusLabel(status: string) {
  return APPLICATION_STATUS_LABELS[status] ?? status;
}
