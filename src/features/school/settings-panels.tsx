import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Mail, Upload } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaFrame } from "@/components/ui/media-frame";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileBlob } from "@/features/arquivos/resolve-file";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { emptyInstitution, schoolSettingDefaults } from "@/lib/school-config";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  resolveGradingProfile,
  DEFAULT_SUPERIOR_GRADING_PROFILE,
} from "@/features/academic/grading-profiles";
import { ProgramCurriculumPanel } from "@/features/school/ProgramCurriculumPanel";
import { supabase } from "@/integrations/supabase/client";
import {
  getSchoolSettings,
  listRecentAuditLogs,
  updateBillingSettings,
  setTermLock,
  updatePedagogySettings,
  updateSchoolAgt,
  updateSchoolBanking,
  updateSchoolSettings,
  type RecentAuditLog,
  type SchoolSettingsBundle,
} from "@/features/school/server";
import { AGT_NIF_PORTAL_URL, validateSchoolNif } from "@/lib/angola-identity";
import {
  angolaBankLabelFromIban,
  formatAngolaIban,
  validateAngolaIban,
} from "@/lib/angola-banking";
import { validateAngolaPhone } from "@/lib/angola-phone";
import {
  createSubject,
  listPedagogicalWorkspace,
  type PedagogicalWorkspace,
} from "@/features/academic/server";
import {
  angolaCoreSubjects,
  angolaSecondaryCourses,
  angolaTeachingLevels,
} from "@/lib/angola-academic";
import { listCalendarEvents, type CalendarEventSummary } from "@/features/calendar/server";
import { whatsappHref } from "@/features/integrations/actions";
import { AppMark } from "@/features/integrations/app-marks";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { groupCatalogItems, integrationFieldHints } from "@/features/integrations/catalog";
import { InstallConsentModal } from "@/features/integrations/InstallConsentModal";
import { installPackageFor } from "@/features/integrations/install";
import {
  consumeIntegrationFocus,
  integrationAnchorId,
  integrationStatusLabel,
} from "@/features/integrations/launcher";
import {
  listSchoolIntegrations,
  revokeSchoolIntegration,
  upsertSchoolIntegration,
  type SchoolIntegrationSummary,
} from "@/features/integrations/server";

/**
 * Painéis reais de "Escola", "Financeiro", "Integrações" e "Segurança" —
 * migrados da antiga página /configuracoes para o modal de Configurações,
 * que passa a ser o único sítio onde estas definições se editam.
 */

const institutionSchema = z.object({
  nome: z.string().trim().min(3, "Nome demasiado curto").max(120, "Máximo 120 caracteres"),
  nif: z
    .string()
    .trim()
    .refine((value) => validateSchoolNif(value).ok, {
      message: "NIF inválido (9–10 dígitos AGT ou formato legado).",
    }),
  diretor: z.string().trim().min(3, "Indique o nome do director").max(120, "Máximo 120 caracteres"),
  telefone: z
    .string()
    .trim()
    .refine((value) => validateAngolaPhone(value).ok, {
      message: "Telefone inválido. Use +244 9XX XXX XXX.",
    }),
  email: z.string().trim().email("E-mail inválido").max(255, "Máximo 255 caracteres"),
  endereco: z.string().trim().min(5, "Endereço demasiado curto").max(200, "Máximo 200 caracteres"),
});

type Institution = z.infer<typeof institutionSchema>;
const initialInstitution: Institution = { ...emptyInstitution };

const institutionFields: {
  id: keyof Institution;
  label: string;
  hint?: string;
  full?: boolean;
}[] = [
  {
    id: "nome",
    label: "Nome da instituição",
    hint: "Aparece em facturas e certificados",
    full: true,
  },
  {
    id: "nif",
    label: "NIF",
    hint: "Entidade AGT (9–10 dígitos). Consulte no Portal do Contribuinte.",
  },
  { id: "diretor", label: "Director geral" },
  { id: "telefone", label: "Telefone" },
  { id: "email", label: "E-mail institucional" },
  { id: "endereco", label: "Endereço", full: true },
];

const preferences = [
  {
    id: "sms",
    label: "SMS automático de mensalidade em atraso",
    description: "Preferência guardada na escola. Envio SMS externo ainda não está ligado no SGA.",
    on: false,
  },
  {
    id: "portal",
    label: "Portal do encarregado",
    description:
      "Preferência guardada na escola. O portal externo não é gerido por esta interface.",
    on: false,
  },
  {
    id: "notas",
    label: "Bloquear notas após fecho do trimestre",
    description: "Intenção pedagógica registada; o bloqueio efectivo depende dos gradebooks SGA.",
    on: true,
  },
  {
    id: "mfa",
    label: "Autenticação em dois passos para administradores",
    description: "Quando activo, a escola pede 2FA TOTP no login (Supabase Auth MFA).",
    on: false,
  },
];

function readStoredPreference(value: unknown, id: string, fallback: boolean) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const stored = (value as Record<string, unknown>)[id];
    if (typeof stored === "boolean") return stored;
  }
  return fallback;
}

const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

export function SchoolSettingsPanel() {
  const currentUser = useCurrentAccount();
  const stackNav = useOptionalStackNav();
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const agtOn = installed.hasCapability("agt.nif") || installed.hasCapability("agt.einvoice");
  const queryClient = useQueryClient();
  const [institution, setInstitution] = useState<Institution>(initialInstitution);
  const [errors, setErrors] = useState<Partial<Record<keyof Institution, string>>>({});
  const [anoLectivo, setAnoLectivo] = useState<string>(schoolSettingDefaults.academicYear);
  const [moeda, setMoeda] = useState<string>(schoolSettingDefaults.currency);
  const [trimestres, setTrimestres] = useState(String(schoolSettingDefaults.evaluationPeriods));
  const [mediaMinima, setMediaMinima] = useState<number[]>([schoolSettingDefaults.passingGrade]);
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(preferences.map((p) => [p.id, p.on])),
  );
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const calendarQuery = useQuery({
    queryKey: ["calendar", "events", "settings"],
    queryFn: () => listCalendarEvents({ data: { limit: 5 } }) as Promise<CalendarEventSummary[]>,
    staleTime: 60_000,
    retry: false,
  });
  const canEdit = currentUser.role === "Administrador";
  const baselineInstitution: Institution = schoolQuery.data
    ? {
        nome: schoolQuery.data.name,
        nif: schoolQuery.data.nif ?? "",
        diretor: schoolQuery.data.director_name ?? "",
        telefone: schoolQuery.data.phone ?? "",
        email: schoolQuery.data.email ?? "",
        endereco: schoolQuery.data.address ?? "",
      }
    : initialInstitution;

  useEffect(() => {
    const school = schoolQuery.data;
    if (!school) return;
    setInstitution({
      nome: school.name,
      nif: school.nif ?? "",
      diretor: school.director_name ?? "",
      telefone: school.phone ?? "",
      email: school.email ?? "",
      endereco: school.address ?? "",
    });
    setAnoLectivo(school.academic_year ?? schoolSettingDefaults.academicYear);
    setMoeda(school.currency || schoolSettingDefaults.currency);
    setTrimestres(String(school.evaluation_periods ?? schoolSettingDefaults.evaluationPeriods));
    setMediaMinima([school.passing_grade ?? schoolSettingDefaults.passingGrade]);
    setLogoUrl(school.branding?.logo_url ?? "");
    if (
      school.preferences &&
      typeof school.preferences === "object" &&
      !Array.isArray(school.preferences)
    ) {
      setToggles(
        Object.fromEntries(
          preferences.map((preference) => [
            preference.id,
            readStoredPreference(school.preferences, preference.id, preference.on),
          ]),
        ),
      );
    }
  }, [schoolQuery.data]);

  const dirty = useMemo(() => {
    const base =
      JSON.stringify(institution) !== JSON.stringify(baselineInstitution) ||
      anoLectivo !== (schoolQuery.data?.academic_year ?? schoolSettingDefaults.academicYear) ||
      moeda !== (schoolQuery.data?.currency ?? schoolSettingDefaults.currency) ||
      trimestres !==
        String(schoolQuery.data?.evaluation_periods ?? schoolSettingDefaults.evaluationPeriods) ||
      mediaMinima[0] !== (schoolQuery.data?.passing_grade ?? schoolSettingDefaults.passingGrade) ||
      logoUrl !== (schoolQuery.data?.branding?.logo_url ?? "");
    const storedPreferences = schoolQuery.data?.preferences;
    const prefsChanged = preferences.some((preference) => {
      const stored = readStoredPreference(storedPreferences, preference.id, preference.on);
      return toggles[preference.id] !== stored;
    });
    return base || prefsChanged;
  }, [
    institution,
    baselineInstitution,
    schoolQuery.data,
    anoLectivo,
    moeda,
    trimestres,
    mediaMinima,
    toggles,
    logoUrl,
  ]);

  useEffect(() => {
    stackNav?.reportDirty(dirty);
  }, [dirty, stackNav]);

  const update = (id: keyof Institution, value: string) => {
    setInstitution((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: undefined }));
  };

  const reset = () => {
    setInstitution(baselineInstitution);
    setErrors({});
    setAnoLectivo(schoolQuery.data?.academic_year ?? schoolSettingDefaults.academicYear);
    setMoeda(schoolQuery.data?.currency ?? schoolSettingDefaults.currency);
    setTrimestres(
      String(schoolQuery.data?.evaluation_periods ?? schoolSettingDefaults.evaluationPeriods),
    );
    setMediaMinima([schoolQuery.data?.passing_grade ?? schoolSettingDefaults.passingGrade]);
    const storedPreferences = schoolQuery.data?.preferences;
    setToggles(
      Object.fromEntries(
        preferences.map((preference) => [
          preference.id,
          readStoredPreference(storedPreferences, preference.id, preference.on),
        ]),
      ),
    );
    toast.info("Alterações descartadas.");
  };

  const save = async () => {
    const parsed = institutionSchema.safeParse(institution);
    if (!parsed.success) {
      const next: Partial<Record<keyof Institution, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Institution;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Corrija os campos destacados antes de guardar.");
      return;
    }
    if (!canEdit) {
      toast.error("Apenas administradores podem alterar estas configurações.");
      return;
    }
    if (!schoolQuery.data) {
      toast.error("Os dados da escola ainda não estão disponíveis.");
      return;
    }
    setSaving(true);
    try {
      const data = await updateSchoolSettings({
        data: {
          name: parsed.data.nome,
          nif: parsed.data.nif,
          directorName: parsed.data.diretor,
          phone: parsed.data.telefone,
          email: parsed.data.email,
          address: parsed.data.endereco,
          academicYear: anoLectivo,
          currency: moeda,
          evaluationPeriods: Number(trimestres),
          passingGrade: mediaMinima[0] ?? schoolSettingDefaults.passingGrade,
          preferences: toggles,
          logoUrl: logoUrl.trim() || "",
        },
      });
      if (!data) {
        await schoolQuery.refetch();
        toast.error("As configurações foram alteradas noutro dispositivo. Reveja os dados.");
        return;
      }
      queryClient.setQueryData(["school", "settings"], data);
      toast.success("Configurações guardadas com segurança.");
    } catch {
      toast.error("Não foi possível guardar as configurações.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    const schoolId = schoolQuery.data?.id;
    if (!schoolId) {
      toast.error("Escola não carregada.");
      return;
    }
    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      toast.error("Use PNG, JPG, WebP ou SVG.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("O logótipo deve ter no máximo 4 MB.");
      return;
    }
    setUploadingLogo(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${schoolId}/logo-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("school-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("school-logos").getPublicUrl(path);
      setLogoUrl(publicUrl);
      toast.success("Logótipo carregado. Guarde as definições para aplicar.");
    } catch {
      toast.error("Não foi possível carregar o logótipo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-8">
      <InstalledModuleTools module="comunicacoes" />
      <InstalledModuleTools module="documentos" />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Atalhos
        </h5>
        <ModuleShortcutsRow />
      </div>
      <div className="space-y-4">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Dados da instituição
        </h5>
        <div className="mb-4 flex flex-wrap items-start gap-4 rounded-xl border border-border bg-muted/20 p-4">
          {logoUrl ? (
            <MediaFrame
              src={logoUrl}
              alt="Logótipo da escola"
              ratio="1/1"
              rounded="rounded-lg"
              className="size-16 border border-border bg-background p-1"
              imgClassName="object-contain"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
              Logo
            </div>
          )}
          <div className="min-w-[min(100%,16rem)] flex-1 space-y-2">
            <Label htmlFor="school-logo">Logótipo (URL)</Label>
            <Input
              id="school-logo"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              disabled={!canEdit}
              placeholder="https://…/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              Usado em facturas, certificados e modelos oficiais. Pode reutilizar o URL da matrícula
              pública ou carregar um ficheiro.
            </p>
            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="school-logo-file" className="cursor-pointer">
                  <span className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-semibold hover:bg-muted">
                    <Upload className="size-3.5" />
                    {uploadingLogo ? "A carregar…" : "Carregar ficheiro"}
                  </span>
                </Label>
                <input
                  id="school-logo-file"
                  type="file"
                  accept={LOGO_ALLOWED_TYPES.join(",")}
                  className="sr-only"
                  disabled={uploadingLogo}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadLogo(file);
                    event.target.value = "";
                  }}
                />
                <PickFileButton
                  label="Da biblioteca"
                  area="publico"
                  acceptKinds={["png", "jpeg"]}
                  variant="outline"
                  size="sm"
                  onPick={(file) => {
                    void (async () => {
                      try {
                        const blob = await resolveFileBlob(file);
                        const asFile = new File([blob], file.name, {
                          type: file.mime || blob.type,
                        });
                        await uploadLogo(asFile);
                      } catch (error) {
                        toast.error("Não foi possível usar o ficheiro da biblioteca", {
                          description: error instanceof Error ? error.message : "Tente novamente.",
                        });
                      }
                    })();
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {institutionFields.map((f) => (
            <div key={f.id} className={f.full ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
              <Label htmlFor={f.id}>{f.label}</Label>
              <Input
                id={f.id}
                value={institution[f.id]}
                onChange={(e) => update(f.id, e.target.value)}
                disabled={!canEdit}
                aria-invalid={Boolean(errors[f.id])}
                className={errors[f.id] ? "border-destructive" : undefined}
              />
              {errors[f.id] ? (
                <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertCircle className="size-3.5" /> {errors[f.id]}
                </p>
              ) : f.hint ? (
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              ) : null}
              {f.id === "telefone" && whatsappOn && institution.telefone.trim() ? (
                <a
                  href={whatsappHref(institution.telefone, "Teste SIGA — WhatsApp da secretaria.")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[11px] font-semibold text-primary hover:underline"
                >
                  Testar WhatsApp
                </a>
              ) : null}
              {f.id === "email" && resendOn && institution.email.trim() ? (
                <a
                  href={`mailto:${institution.email}?subject=${encodeURIComponent("Teste SIGA — Resend")}&body=${encodeURIComponent("Mensagem de teste do SIGA.")}`}
                  className="inline-block text-[11px] font-semibold text-primary hover:underline"
                >
                  Testar e-mail Resend
                </a>
              ) : null}
              {f.id === "nif" ? (
                <a
                  href={AGT_NIF_PORTAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[11px] font-semibold text-primary hover:underline"
                >
                  Consultar NIF na AGT
                </a>
              ) : null}
              {f.id === "nif" && agtOn && institution.nif.trim() ? (
                <button
                  type="button"
                  className="inline-block text-[11px] font-semibold text-primary hover:underline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(institution.nif.trim());
                    toast.success(`NIF ${institution.nif.trim()} copiado para a AGT`);
                  }}
                >
                  Copiar NIF AGT
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Ano lectivo
        </h5>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ano">Ano lectivo activo</Label>
            <Select value={anoLectivo} onValueChange={setAnoLectivo} disabled={!canEdit}>
              <SelectTrigger id="ano">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[schoolSettingDefaults.academicYear, "2025/2026", "2026/2027"]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="moeda">Moeda</Label>
            <Select value={moeda} onValueChange={setMoeda} disabled={!canEdit}>
              <SelectTrigger id="moeda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[schoolSettingDefaults.currency, "AOA", "USD", "EUR", "Kwanza (Kz)"]
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trimestres">Períodos de avaliação</Label>
            <Select value={trimestres} onValueChange={setTrimestres} disabled={!canEdit}>
              <SelectTrigger id="trimestres">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["2", "3", "4"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v} períodos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="media">Média mínima de aprovação</Label>
              <Badge variant="secondary">{mediaMinima[0]} valores</Badge>
            </div>
            <Slider
              id="media"
              min={5}
              max={20}
              step={0.5}
              value={mediaMinima}
              onValueChange={setMediaMinima}
              disabled={!canEdit}
            />
          </div>
        </div>

        {calendarQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar períodos lectivos…</p>
        ) : (calendarQuery.data ?? []).length > 0 ? (
          <ul className="space-y-2">
            {(calendarQuery.data ?? []).map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm"
              >
                <span className="text-muted-foreground">{event.title}</span>
                <span className="font-semibold">
                  {new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-1">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Notificações
        </h5>
        <ul className="space-y-1">
          {preferences.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/60"
            >
              <div>
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </div>
              <Switch
                checked={toggles[p.id] ?? false}
                onCheckedChange={(v) => setToggles((prev) => ({ ...prev, [p.id]: v }))}
                aria-label={p.label}
                disabled={!canEdit}
              />
            </li>
          ))}
        </ul>
      </div>

      {canEdit ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={reset} disabled={!dirty || saving}>
            Descartar
          </Button>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? "A guardar…" : "Guardar alterações"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Apenas administradores podem alterar estas configurações.
        </p>
      )}
    </div>
  );
}

export function BillingParametersSummary() {
  const currentUser = useCurrentAccount();
  const canManage = ["Administrador", "Tesouraria"].includes(currentUser.role);
  const billingQuery = useQuery({
    queryKey: ["school", "billing-settings"],
    enabled: canManage,
    queryFn: async () => (await (getSchoolSettings() as Promise<SchoolSettingsBundle>)).billing,
    staleTime: 5 * 60_000,
  });

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Disponível apenas para Administração e Tesouraria.
      </p>
    );
  }
  if (billingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar parâmetros…</p>;
  }
  if (!billingQuery.data) {
    return <p className="text-sm text-destructive">Parâmetros financeiros indisponíveis.</p>;
  }

  const items = [
    { label: "Dia de vencimento", valor: `${billingQuery.data.due_day} de cada mês` },
    { label: "Multa por atraso", valor: `${billingQuery.data.late_fee_percent}%` },
    { label: "Tolerância", valor: `${billingQuery.data.grace_days} dias` },
    { label: "Desconto irmãos", valor: `${billingQuery.data.sibling_discount_percent}%` },
  ];

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between py-2.5 text-sm">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-semibold tabular-nums">{item.valor}</span>
        </li>
      ))}
    </ul>
  );
}

export function BillingSettingsForm() {
  const currentUser = useCurrentAccount();
  const stackNav = useOptionalStackNav();
  const queryClient = useQueryClient();
  const installed = useInstalledIntegrations();
  const multicaixaOn = installed.isInstalled("multicaixa_express");
  const unitelOn = installed.isInstalled("unitel_money");
  const canManage = ["Administrador", "Tesouraria"].includes(currentUser.role);
  const [values, setValues] = useState({ due: "10", fee: "2", grace: "5", discount: "10" });
  const [saving, setSaving] = useState(false);
  const billingQuery = useQuery({
    queryKey: ["school", "billing-settings"],
    enabled: canManage,
    queryFn: async () => (await (getSchoolSettings() as Promise<SchoolSettingsBundle>)).billing,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!billingQuery.data) return;
    setValues({
      due: String(billingQuery.data.due_day),
      fee: String(billingQuery.data.late_fee_percent),
      grace: String(billingQuery.data.grace_days),
      discount: String(billingQuery.data.sibling_discount_percent),
    });
  }, [billingQuery.data]);

  const billingDirty = Boolean(
    billingQuery.data &&
    (values.due !== String(billingQuery.data.due_day) ||
      values.fee !== String(billingQuery.data.late_fee_percent) ||
      values.grace !== String(billingQuery.data.grace_days) ||
      values.discount !== String(billingQuery.data.sibling_discount_percent)),
  );

  useEffect(() => {
    stackNav?.reportDirty(billingDirty);
  }, [billingDirty, stackNav]);

  const saveBilling = async () => {
    const due = Number(values.due);
    const fee = Number(values.fee);
    const grace = Number(values.grace);
    const discount = Number(values.discount);
    if (
      !Number.isInteger(due) ||
      due < 1 ||
      due > 28 ||
      !Number.isInteger(grace) ||
      grace < 0 ||
      grace > 60 ||
      !Number.isFinite(fee) ||
      fee < 0 ||
      fee > 100 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100
    ) {
      toast.error("Revise os limites das regras de cobrança.");
      return;
    }
    if (!billingQuery.data) return;
    setSaving(true);
    try {
      const data = await updateBillingSettings({
        data: {
          dueDay: due,
          lateFeePercent: fee,
          graceDays: grace,
          siblingDiscountPercent: discount,
        },
      });
      if (!data) {
        await billingQuery.refetch();
        toast.error("As regras foram alteradas noutro dispositivo. Reveja os valores.");
        return;
      }
      queryClient.setQueryData(["school", "billing-settings"], data);
      toast.success("Regras de cobrança actualizadas.");
    } catch {
      toast.error("Não foi possível actualizar as regras de cobrança.");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Disponível apenas para Administração e Tesouraria.
      </p>
    );
  }
  if (billingQuery.isLoading)
    return <p className="text-sm text-muted-foreground">A carregar regras…</p>;
  if (!billingQuery.data)
    return <p className="text-sm text-destructive">Regras de cobrança indisponíveis.</p>;

  const fields = [
    { id: "venc", key: "due", label: "Dia de vencimento", min: 1, max: 28 },
    { id: "multa", key: "fee", label: "Multa por atraso (%)", min: 0, max: 100 },
    { id: "tolerancia", key: "grace", label: "Tolerância (dias)", min: 0, max: 60 },
    { id: "desconto", key: "discount", label: "Desconto irmãos (%)", min: 0, max: 100 },
  ] as const;

  return (
    <div className="space-y-4">
      {multicaixaOn || unitelOn ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm">
          <p className="font-semibold">Canais de pagamento instalados</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {multicaixaOn
              ? "Multicaixa Express: referências EMIS em Financeiro → Planos e Faturas. "
              : ""}
            {unitelOn ? "Unitel Money: cobrança móvel nos planos e recibos." : ""}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id}>{field.label}</Label>
            <Input
              id={field.id}
              type="number"
              min={field.min}
              max={field.max}
              step={field.key === "fee" || field.key === "discount" ? 0.01 : 1}
              value={values[field.key]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={saveBilling} disabled={saving}>
          {saving ? "A guardar…" : "Guardar cobrança"}
        </Button>
      </div>
    </div>
  );
}

export function FinancePanel() {
  return (
    <div className="space-y-8">
      <InstalledModuleTools module="financeiro" />
      <InstalledModuleTools module="faturas" />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Parâmetros activos
        </h5>
        <BillingParametersSummary />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Conta bancária (Angola)
        </h5>
        <SchoolBankingForm />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          AGT — facturação electrónica
        </h5>
        <SchoolAgtForm />
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Regras de cobrança
        </h5>
        <BillingSettingsForm />
      </div>
    </div>
  );
}

function SchoolBankingForm() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador" || currentUser.role === "Tesouraria";
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const banking = schoolQuery.data?.banking;
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [iban, setIban] = useState("");
  const [swift, setSwift] = useState("");
  const [merchant, setMerchant] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!banking) return;
    setBankName(banking.bank_name ?? "");
    setAccountHolder(banking.account_holder ?? "");
    setIban(banking.iban ? formatAngolaIban(banking.iban) : "");
    setSwift(banking.swift ?? "");
    setMerchant(banking.multicaixa_merchant ?? "");
  }, [banking]);

  const bankLabel = iban.trim() ? angolaBankLabelFromIban(iban) : null;

  const save = async () => {
    const checked = validateAngolaIban(iban);
    if (!checked.ok) {
      toast.error(checked.error ?? "IBAN inválido.");
      return;
    }
    setSaving(true);
    try {
      const data = await updateSchoolBanking({
        data: {
          bankName: bankName.trim(),
          accountHolder: accountHolder.trim(),
          iban: checked.compact ?? iban,
          swift: swift.trim(),
          multicaixaMerchant: merchant.trim(),
        },
      });
      queryClient.setQueryData(["school", "settings"], (prev: unknown) =>
        prev && typeof prev === "object" ? { ...prev, banking: data } : prev,
      );
      toast.success("Dados bancários guardados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bank-holder">Titular da conta</Label>
        <Input
          id="bank-holder"
          value={accountHolder}
          onChange={(event) => setAccountHolder(event.target.value)}
          disabled={!canEdit}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bank-name">Banco</Label>
        <Input
          id="bank-name"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          disabled={!canEdit}
          placeholder="BAI, BIC, BFA…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bank-swift">SWIFT (opcional)</Label>
        <Input
          id="bank-swift"
          value={swift}
          onChange={(event) => setSwift(event.target.value.toUpperCase())}
          disabled={!canEdit}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bank-iban">IBAN (AO…)</Label>
        <Input
          id="bank-iban"
          value={iban}
          onChange={(event) => setIban(event.target.value.toUpperCase())}
          disabled={!canEdit}
          placeholder="AO20 0044 3015 6278 3436 9480 4"
        />
        {bankLabel ? (
          <p className="text-xs text-muted-foreground">{bankLabel}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Formato BNA: 25 caracteres (AO + 23 dígitos).
          </p>
        )}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bank-merchant">Merchant Multicaixa (EMIS)</Label>
        <Input
          id="bank-merchant"
          value={merchant}
          onChange={(event) => setMerchant(event.target.value)}
          disabled={!canEdit}
          placeholder="Referência EMIS / merchant ID"
        />
      </div>
      {canEdit ? (
        <div className="sm:col-span-2 flex justify-end">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "A guardar…" : "Guardar banco"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SchoolAgtForm() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador";
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const agt = schoolQuery.data?.agt;
  const [software, setSoftware] = useState("");
  const [series, setSeries] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agt) return;
    setSoftware(agt.software_certified ?? "");
    setSeries(agt.invoice_series ?? "");
    setNotes(agt.fiscal_notes ?? "");
  }, [agt]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await updateSchoolAgt({
        data: {
          softwareCertified: software.trim(),
          invoiceSeries: series.trim(),
          fiscalNotes: notes.trim(),
        },
      });
      queryClient.setQueryData(["school", "settings"], (prev: unknown) =>
        prev && typeof prev === "object" ? { ...prev, agt: data } : prev,
      );
      toast.success("Parâmetros AGT guardados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        O SIGA prepara linhas AGT e recibos oficiais. A submissão electrónica depende do software
        certificado instalado na escola.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agt-software">Software certificado</Label>
          <Input
            id="agt-software"
            value={software}
            onChange={(event) => setSoftware(event.target.value)}
            disabled={!canEdit}
            placeholder="Nome do produto certificado AGT"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agt-series">Série de facturação</Label>
          <Input
            id="agt-series"
            value={series}
            onChange={(event) => setSeries(event.target.value)}
            disabled={!canEdit}
            placeholder="Ex.: SIGA/2026"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="agt-notes">Notas fiscais internas</Label>
          <Input
            id="agt-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!canEdit}
            placeholder="Observações para tesouraria e auditoria"
          />
        </div>
      </div>
      <a
        href={AGT_NIF_PORTAL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs font-semibold text-primary hover:underline"
      >
        Portal do Contribuinte — consultar NIF
      </a>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "A guardar…" : "Guardar AGT"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AcademicIntegrationsCatalog() {
  const queryClient = useQueryClient();
  const [installProvider, setInstallProvider] = useState<string | null>(null);
  const catalogQuery = useQuery({
    queryKey: ["school", "integrations"],
    queryFn: () => listSchoolIntegrations() as Promise<SchoolIntegrationSummary[]>,
    retry: false,
  });
  const items = catalogQuery.data ?? [];
  const grouped = useMemo(() => groupCatalogItems(items), [items]);

  useEffect(() => {
    const provider = consumeIntegrationFocus();
    if (!provider || !items.length) return;
    const node = document.getElementById(integrationAnchorId(provider));
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    node?.classList.add("ring-2", "ring-primary/40");
    const timer = window.setTimeout(
      () => node?.classList.remove("ring-2", "ring-primary/40"),
      2400,
    );
    return () => window.clearTimeout(timer);
  }, [items.length]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Catálogo de integrações
        </h5>
        <p className="text-xs text-muted-foreground">
          Configure chaves e webhooks. As chamadas externas ficam prontas a ligar.
        </p>
      </div>
      {grouped.map((entry) => (
        <div key={entry.group} className="space-y-2">
          <h6 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {entry.group}
          </h6>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {entry.items.map((item) => {
              const hints = integrationFieldHints[item.id];
              const config = item.config ?? {};
              const pack = installPackageFor(item.id);
              const installed = item.status !== "disconnected";
              return (
                <li
                  key={item.id}
                  id={integrationAnchorId(item.id)}
                  className="space-y-2 rounded-xl px-3 py-3 scroll-mt-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <AppMark id={item.id} className="size-8 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant={item.status === "disconnected" ? "secondary" : "default"}>
                        {integrationStatusLabel(item.status)}
                      </Badge>
                      {installed ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-destructive hover:underline"
                          onClick={() => {
                            void revokeSchoolIntegration({ data: { provider: item.id } })
                              .then(() => {
                                toast.success(`${item.name} desinstalado.`);
                                return queryClient.invalidateQueries({
                                  queryKey: ["school", "integrations"],
                                });
                              })
                              .catch((error) =>
                                toast.error(
                                  error instanceof Error ? error.message : "Falha ao desinstalar.",
                                ),
                              );
                          }}
                        >
                          Desinstalar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-primary hover:underline"
                          onClick={() => setInstallProvider(item.id)}
                        >
                          Instalar
                        </button>
                      )}
                    </div>
                  </div>
                  {pack && item.grantedCapabilities?.length ? (
                    <p className="text-[11px] text-muted-foreground">
                      Funções no SIGA:{" "}
                      {pack.capabilities
                        .filter((capability) => item.grantedCapabilities.includes(capability.id))
                        .map((capability) => capability.label)
                        .join(" · ")}
                    </p>
                  ) : null}
                  <form
                    key={`${item.id}-${item.status}-${String(config["merchantId"] ?? "")}`}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void upsertSchoolIntegration({
                        data: {
                          provider: item.id,
                          status: "configured",
                          merchantId: String(data.get("merchantId") || ""),
                          callbackUrl: String(data.get("callbackUrl") || ""),
                          sandbox: true,
                        },
                      })
                        .then(() => {
                          toast.success(`${item.name} configurado.`);
                          return queryClient.invalidateQueries({
                            queryKey: ["school", "integrations"],
                          });
                        })
                        .catch((error) =>
                          toast.error(error instanceof Error ? error.message : "Falha ao guardar."),
                        );
                    }}
                  >
                    <Input
                      name="merchantId"
                      aria-label={`Identificador de comerciante ${item.name}`}
                      defaultValue={String(config["merchantId"] ?? "")}
                      placeholder={hints.merchant}
                      className="h-8 text-xs"
                    />
                    <Input
                      name="callbackUrl"
                      aria-label={`URL de retorno ${item.name}`}
                      defaultValue={String(config["callbackUrl"] ?? "")}
                      placeholder={hints.callback}
                      className="h-8 text-xs"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Guardar
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <InstallConsentModal
        provider={installProvider}
        open={Boolean(installProvider)}
        onOpenChange={(open) => {
          if (!open) setInstallProvider(null);
        }}
      />
    </div>
  );
}

const otherChannelSeeds = [
  { name: "SMS (operadora local)", installed: () => false },
  { name: "Portal do encarregado", installed: () => false, label: "Fora desta UI" },
  { name: "Comunicados internos (announcements)", installed: () => true },
  { name: "Exportação CSV/PDF nas listas", installed: () => true },
  {
    name: "Pagamentos por referência",
    installed: (i: ReturnType<typeof useInstalledIntegrations>) =>
      i.isInstalled("multicaixa_express") || i.isInstalled("unitel_money"),
  },
  {
    name: "WhatsApp Business",
    installed: (i: ReturnType<typeof useInstalledIntegrations>) =>
      i.isInstalled("whatsapp_business"),
  },
  {
    name: "Resend (e-mail transaccional)",
    installed: (i: ReturnType<typeof useInstalledIntegrations>) => i.isInstalled("resend_email"),
  },
] as const;

export function IntegrationsPanel() {
  const installed = useInstalledIntegrations();
  const otherChannels = otherChannelSeeds.map((channel) => {
    const on = channel.installed(installed);
    const state = "label" in channel && !on ? channel.label : on ? "Instalado" : "Não ligado";
    return {
      name: channel.name,
      state,
      tone: on ? ("success" as const) : ("muted" as const),
    };
  });

  return (
    <div className="space-y-8">
      <AcademicIntegrationsCatalog />
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              G
            </span>
            <h5 className="text-sm font-semibold text-foreground">
              Google Workspace & Cloud Conectados
            </h5>
          </div>
          <Badge variant="default" className="bg-success text-success-foreground hover:bg-success">
            Ativo (OAuth 2.0)
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          As integrações do Google Workspace (Google Calendar, Gmail, Google Drive, Google Sheets,
          Google Docs e Google Tasks) estão habilitadas para complementar o SIGA. O Supabase
          continua a ser a base de dados principal e oficial do sistema.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
          <div className="rounded-md border border-border/70 bg-card p-2">
            <span className="font-medium text-foreground">Google Calendar</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sincronização de aulas e exames
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-2">
            <span className="font-medium text-foreground">Gmail</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Notificações e avisos oficiais
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-2">
            <span className="font-medium text-foreground">Google Sheets</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Exportação de pautas e relatórios
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-2">
            <span className="font-medium text-foreground">Google Drive</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Dossiês e arquivo pedagógico</p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-2">
            <span className="font-medium text-foreground">Google Docs</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Declarações e minutas</p>
          </div>
          <div className="rounded-md border border-border/70 bg-card p-2">
            <span className="font-medium text-foreground">Google Tasks</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Tarefas da secretaria</p>
          </div>
        </div>
      </div>
      {installed.isInstalled("resend_email") ? (
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <strong>Resend</strong> já está instalado para e-mail transaccional da escola. O Gmail
          abaixo é opcional para contas pessoais de cada utilizador.
        </p>
      ) : null}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Gmail (por utilizador)
          </h5>
          <Badge variant="outline">Requer login</Badge>
        </div>
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Mail className="size-5" />
          </span>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Com o Gmail ligado, cada secretária ou director envia comunicações, facturas e
              certificados a partir do seu próprio e-mail, com histórico na caixa de saída pessoal.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {[
                "Envio de comunicações em nome do próprio utilizador",
                "Anexos automáticos de facturas e declarações",
                "Registo do envio na ficha do aluno",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="size-3.5 text-success" /> {f}
                </li>
              ))}
            </ul>
            <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              Para ligar contas individuais é primeiro necessário activar as contas de utilizador do
              sistema (login próprio de cada funcionário). Enquanto isso, o botão fica inactivo.
            </div>
            <Button disabled className="gap-2">
              <Mail className="size-4" /> Ligar a minha conta Gmail
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Outros canais
        </h5>
        <ul className="divide-y divide-border">
          {otherChannels.map((i) => (
            <li key={i.name} className="flex items-center justify-between py-2.5 text-sm">
              <span>{i.name}</span>
              <Badge
                variant={i.tone === "success" ? "default" : "secondary"}
                className={i.tone === "muted" ? "text-muted-foreground" : undefined}
              >
                {i.state}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const accessPolicies = [
  { label: "Protecção de rotas por cargo (RouteAccessGate)", state: "Activo" },
  { label: "Escrita sensível via service role no servidor", state: "Activo" },
  { label: "Auditoria recente (audit_logs SGA)", state: "Activo" },
  { label: "2FA TOTP (Supabase Auth MFA)", state: "Disponível" },
  { label: "Restrição por horário escolar", state: "Não configurado" },
];

function formatAuditAction(action: string, entityType: string) {
  const operation = action.split(".").at(-1)?.toLowerCase();
  const operationLabel =
    operation === "insert" ? "Criou" : operation === "delete" ? "Eliminou" : "Actualizou";
  const entityLabels: Record<string, string> = {
    schools: "escola",
    people: "pessoa",
    students: "aluno",
    enrollments: "matrícula",
    school_memberships: "conta de acesso",
    roles: "papel",
    member_roles: "função",
    student_guardians: "encarregado",
    finance_invoices: "fatura",
    finance_receipts: "recibo",
    announcements: "comunicado",
    terms: "período lectivo",
    class_groups: "turma",
    document_requests: "documento",
  };
  return `${operationLabel} ${entityLabels[entityType] ?? entityType}`;
}

function AuditLogList() {
  const currentUser = useCurrentAccount();
  const isAdministrator = currentUser.role === "Administrador";
  const auditQuery = useQuery({
    queryKey: ["audit-logs", "recent", currentUser.id],
    enabled: isAdministrator,
    staleTime: 30_000,
    queryFn: () => listRecentAuditLogs() as Promise<RecentAuditLog[]>,
  });

  if (currentUser.profile.isLoading) {
    return <p className="text-sm text-muted-foreground">A confirmar permissões…</p>;
  }
  if (!isAdministrator) {
    return (
      <p className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        O histórico completo está disponível apenas para administradores.
      </p>
    );
  }
  if (auditQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">A carregar eventos…</p>;
  }
  if (auditQuery.isError) {
    return <p className="text-sm text-destructive">Não foi possível carregar a auditoria.</p>;
  }
  if (!auditQuery.data?.length) {
    return <p className="text-sm text-muted-foreground">Ainda não existem eventos registados.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {auditQuery.data.map((event) => (
        <li key={event.id} className="rounded-lg border border-border bg-secondary/40 px-4 py-2.5">
          <p className="font-medium">{formatAuditAction(event.action, event.entity_type)}</p>
          <p className="text-xs text-muted-foreground">
            {event.actor_id
              ? event.actor_id === currentUser.id
                ? currentUser.name
                : `Utilizador ${event.actor_id.slice(0, 8)}`
              : "Sistema"}
            {" · "}
            {new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(event.created_at),
            )}
          </p>
          {event.reason ? (
            <p className="mt-1 text-xs text-muted-foreground">{event.reason}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TwoFactorEnroll() {
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
        Autenticação em dois passos
      </h5>
      <p className="text-sm text-muted-foreground">
        Associe uma aplicação autenticadora (Google Authenticator, Authy ou 1Password). No próximo
        login o SIGA pede o código TOTP.
      </p>
      {qr ? (
        <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
          <MediaFrame
            src={qr}
            alt="QR do autenticador"
            ratio="1/1"
            rounded="rounded-lg"
            className="mx-auto size-40 bg-background p-2"
            imgClassName="object-contain"
          />
          <div className="flex gap-2">
            <Input
              aria-label="Código de autenticação em dois passos"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              placeholder="Código de 6 dígitos"
            />
            <Button
              disabled={busy || code.length < 6 || !factorId}
              onClick={async () => {
                if (!factorId) return;
                setBusy(true);
                try {
                  const challenge = await supabase.auth.mfa.challenge({ factorId });
                  if (challenge.error) throw challenge.error;
                  const verified = await supabase.auth.mfa.verify({
                    factorId,
                    challengeId: challenge.data.id,
                    code: code.trim(),
                  });
                  if (verified.error) throw verified.error;
                  toast.success("2FA activado nesta conta.");
                  setQr(null);
                  setFactorId(null);
                  setCode("");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Código inválido.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const enrolled = await supabase.auth.mfa.enroll({
                factorType: "totp",
                friendlyName: "SIGA",
              });
              if (enrolled.error) throw enrolled.error;
              setFactorId(enrolled.data.id);
              setQr(enrolled.data.totp.qr_code);
              toast.success("Leia o QR na aplicação autenticadora.");
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "Não foi possível iniciar o 2FA.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Activar 2FA nesta conta
        </Button>
      )}
    </div>
  );
}

export function SecurityPanel() {
  const resendOn = useInstalledIntegrations().hasCapability("resend.send");
  return (
    <div className="space-y-8">
      {resendOn ? (
        <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm">
          <p className="font-semibold">Convites por e-mail</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Com Resend instalado, use{" "}
            <Link to="/acessos" className="font-semibold text-primary hover:underline">
              Acessos
            </Link>{" "}
            para copiar links de convite ou recuperação nos botões Reenviar / E-mail.
          </p>
        </div>
      ) : null}
      <TwoFactorEnroll />
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Políticas de acesso
        </h5>
        <ul className="space-y-1">
          {accessPolicies.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/60"
            >
              <span className="text-sm">{s.label}</span>
              <Badge variant={s.state === "Activo" ? "default" : "secondary"}>{s.state}</Badge>
            </li>
          ))}
        </ul>
      </div>
      <Separator />
      <div className="space-y-3">
        <h5 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Auditoria
        </h5>
        <AuditLogList />
      </div>
    </div>
  );
}

export function PedagogicalSettingsPanel() {
  const currentUser = useCurrentAccount();
  const queryClient = useQueryClient();
  const canEdit = currentUser.role === "Administrador";
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace"],
    queryFn: () => listPedagogicalWorkspace({ data: {} }) as Promise<PedagogicalWorkspace>,
    staleTime: 60_000,
    retry: false,
  });
  const [teachingLevels, setTeachingLevels] = useState<string[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [closedTerms, setClosedTerms] = useState<Array<1 | 2 | 3>>([]);
  const [gradingScale, setGradingScale] = useState<"20_ects" | "gpa4">(
    DEFAULT_SUPERIOR_GRADING_PROFILE.scale,
  );
  const [gradingComponents, setGradingComponents] = useState<"frequencia_exame" | "so_exame">(
    DEFAULT_SUPERIOR_GRADING_PROFILE.components,
  );
  const [saving, setSaving] = useState(false);
  const [creatingCode, setCreatingCode] = useState<string | null>(null);
  const [lockingTerm, setLockingTerm] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    const pedagogy = schoolQuery.data?.pedagogy;
    if (!pedagogy) return;
    setTeachingLevels(pedagogy.teachingLevels ?? []);
    setCourses(pedagogy.courses ?? []);
    setClosedTerms(pedagogy.closedTerms ?? []);
    const resolved = resolveGradingProfile({ schoolDefault: pedagogy.gradingProfile ?? null });
    setGradingScale(resolved.scale);
    setGradingComponents(resolved.components);
  }, [schoolQuery.data?.pedagogy]);

  const existingSubjects = workspaceQuery.data?.subjects ?? [];
  const existingCodes = new Set(
    existingSubjects.map((subject) => String(subject.code ?? "").toUpperCase()),
  );
  const suggestedSubjects = angolaCoreSubjects.filter(
    (subject) =>
      teachingLevels.length === 0 || subject.levels.some((level) => teachingLevels.includes(level)),
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const save = async () => {
    setSaving(true);
    try {
      await updatePedagogySettings({
        data: {
          teachingLevels: teachingLevels as Array<
            "pre_escolar" | "primario" | "i_ciclo" | "ii_ciclo" | "tecnico" | "adultos" | "superior"
          >,
          courses: courses as Array<"cfb" | "cej" | "letras" | "tecnico">,
          closedTerms,
          gradingProfile: teachingLevels.includes("superior")
            ? { scale: gradingScale, components: gradingComponents }
            : null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
      toast.success("Configuração pedagógica guardada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  };

  const addSuggestedSubject = async (code: string, name: string) => {
    setCreatingCode(code);
    try {
      await createSubject({ data: { code, name, weeklyHours: 4 } });
      await queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] });
      toast.success(`${name} adicionada ao catálogo.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a disciplina.");
    } finally {
      setCreatingCode(null);
    }
  };

  return (
    <div className="space-y-6">
      <InstalledModuleTools module="pedagogica" />
      <div>
        <h4 className="font-display text-base font-extrabold">Níveis de ensino</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha os ciclos que a escola lecciona. A pauta e o catálogo de disciplinas usam esta
          selecção.
        </p>
        <div className="mt-3 space-y-2">
          {angolaTeachingLevels.map((level) => (
            <label
              key={level.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <Switch
                checked={teachingLevels.includes(level.id)}
                disabled={!canEdit}
                onCheckedChange={() => setTeachingLevels((current) => toggle(current, level.id))}
              />
              <span>
                <span className="block text-sm font-semibold">{level.label}</span>
                <span className="text-xs text-muted-foreground">
                  Classes: {level.classes.join(", ")}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-display text-base font-extrabold">Cursos do II Ciclo</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Áreas de formação oferecidas no ensino médio / II ciclo.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {angolaSecondaryCourses.map((course) => (
            <label
              key={course.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <Switch
                checked={courses.includes(course.id)}
                disabled={!canEdit || !teachingLevels.includes("ii_ciclo")}
                onCheckedChange={() => setCourses((current) => toggle(current, course.id))}
              />
              <span>
                <span className="block text-sm font-semibold">{course.short}</span>
                <span className="text-xs text-muted-foreground">{course.label}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {teachingLevels.includes("superior") ? (
        <>
          <Separator />
          <div>
            <h4 className="font-display text-base font-extrabold">
              Motor de notas — Ensino Superior
            </h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Valor por omissão da escola; cada curso pode ter a sua própria regra nas definições do
              curso. Sugestão do sistema:{" "}
              {DEFAULT_SUPERIOR_GRADING_PROFILE.scale === "20_ects"
                ? "0–20 com créditos ECTS"
                : "GPA 0–4"}{" "}
              +{" "}
              {DEFAULT_SUPERIOR_GRADING_PROFILE.components === "frequencia_exame"
                ? "Frequência + Exame Final"
                : "Só Exame Final"}
              .
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Escala de notas
                </Label>
                {[
                  { id: "20_ects" as const, label: "0–20 com créditos ECTS" },
                  { id: "gpa4" as const, label: "GPA 0–4 (notas-letra)" },
                ].map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <Switch
                      checked={gradingScale === option.id}
                      disabled={!canEdit}
                      onCheckedChange={() => setGradingScale(option.id)}
                    />
                    <span className="text-sm font-semibold">{option.label}</span>
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Estrutura de avaliação
                </Label>
                {[
                  { id: "frequencia_exame" as const, label: "Frequência + Exame Final" },
                  { id: "so_exame" as const, label: "Só Exame Final" },
                ].map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <Switch
                      checked={gradingComponents === option.id}
                      disabled={!canEdit}
                      onCheckedChange={() => setGradingComponents(option.id)}
                    />
                    <span className="text-sm font-semibold">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-display text-base font-extrabold">Currículo dos Cursos</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Disciplinas de cada curso, organizadas por semestre, com créditos ECTS. Usado para
              aplicar automaticamente as disciplinas certas a uma turma desse curso.
            </p>
            <div className="mt-3">
              <ProgramCurriculumPanel
                courses={workspaceQuery.data?.courses ?? []}
                subjects={workspaceQuery.data?.subjects ?? []}
                canEdit={canEdit}
              />
            </div>
          </div>
        </>
      ) : null}

      <Separator />

      <div>
        <h4 className="font-display text-base font-extrabold">Fecho de trimestre</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Com o trimestre fechado, ninguém lança nem altera notas na pauta.
        </p>
        <div className="mt-3 space-y-2">
          {([1, 2, 3] as const).map((term) => {
            const closed = closedTerms.includes(term);
            return (
              <label
                key={term}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <span className="text-sm font-semibold">{term}º trimestre</span>
                <Switch
                  checked={closed}
                  disabled={!canEdit || lockingTerm === term}
                  onCheckedChange={(next) => {
                    setLockingTerm(term);
                    void setTermLock({ data: { term, closed: next } })
                      .then(async () => {
                        await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
                        toast.success(
                          next ? `${term}º trimestre fechado.` : `${term}º trimestre reaberto.`,
                        );
                      })
                      .catch((error) => {
                        toast.error(
                          error instanceof Error ? error.message : "Não foi possível alterar.",
                        );
                      })
                      .finally(() => setLockingTerm(null));
                  }}
                />
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-display text-base font-extrabold">Disciplinas do currículo</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Sugestões MINED para os níveis activos. Pode adicionar as que ainda não existem no
          catálogo.
        </p>
        <ul className="mt-3 space-y-2">
          {suggestedSubjects.map((subject) => {
            const exists = existingCodes.has(subject.code);
            return (
              <li
                key={subject.code}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2"
              >
                <span>
                  <span className="text-sm font-semibold">
                    {subject.code} · {subject.name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {subject.levels
                      .map(
                        (levelId) =>
                          angolaTeachingLevels.find((level) => level.id === levelId)?.cycle,
                      )
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {exists ? (
                  <Badge variant="secondary">No catálogo</Badge>
                ) : canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creatingCode === subject.code}
                    onClick={() => void addSuggestedSubject(subject.code, subject.name)}
                  >
                    {creatingCode === subject.code ? "A criar…" : "Adicionar"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {canEdit ? (
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "A guardar…" : "Guardar configuração pedagógica"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Só o administrador altera estes níveis.</p>
      )}
    </div>
  );
}

export function ModuleShortcutsRow() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <Link to="/calendario">Calendário lectivo</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/acessos">Utilizadores e acessos</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/comunicacoes">Comunicações</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/documentos" hash="modelos">
          Modelos de impressão
        </Link>
      </Button>
    </div>
  );
}
