import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { resolveFileBlob } from "@/features/arquivos/resolve-file";
import { useOptionalStackNav } from "@/components/ui/stacked-modal";
import { angolaSchoolTypes, emptyInstitution, schoolSettingDefaults } from "@/lib/school-config";
import { formatGeoPoint, parseGeoPoint } from "@/lib/geo-coordinates";
import { normalizeEvaluationPeriods } from "@/lib/angola-academic";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { supabase } from "@/integrations/supabase/client";
import {
  getSchoolSettings,
  updateSchoolSettings,
  type SchoolSettingsBundle,
} from "@/features/school/server";
import { AGT_NIF_PORTAL_URL, validateSchoolNif } from "@/lib/angola-identity";
import { validateAngolaPhone } from "@/lib/angola-phone";
import { listCalendarEvents, type CalendarEventSummary } from "@/features/calendar/server";
import { termLifecycle, termLifecycleLabels, todayInLuanda } from "@/features/calendar/dates";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { ModuleShortcutsRow } from "./settings-shortcuts-row";

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
  provincia: z.string().trim().max(80, "Máximo 80 caracteres"),
  municipio: z.string().trim().max(80, "Máximo 80 caracteres"),
  comuna: z.string().trim().max(80, "Máximo 80 caracteres"),
  bairro: z.string().trim().max(120, "Máximo 120 caracteres"),
  gps: z
    .string()
    .trim()
    .refine((value) => parseGeoPoint(value) !== "invalid", {
      message: "Use latitude, longitude (por exemplo -12.7761, 15.7392).",
    }),
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
  { id: "provincia", label: "Província" },
  { id: "municipio", label: "Município" },
  { id: "comuna", label: "Comuna" },
  { id: "bairro", label: "Bairro" },
  {
    id: "gps",
    label: "Coordenadas GPS",
    hint: "Latitude, longitude — copie do mapa (por exemplo -12.7761, 15.7392).",
    full: true,
  },
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

/** Campos de localização do formulário a partir do que o servidor devolve. */
function locationFields(school: {
  province?: string | null;
  municipality?: string | null;
  commune?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  return {
    provincia: school.province ?? "",
    municipio: school.municipality ?? "",
    comuna: school.commune ?? "",
    bairro: school.neighborhood ?? "",
    gps: formatGeoPoint(school.latitude, school.longitude),
  };
}

function readStoredPreference(value: unknown, id: string, fallback: boolean) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const stored = (value as Record<string, unknown>)[id];
    if (typeof stored === "boolean") return stored;
  }
  return fallback;
}

/**
 * Escolas configuradas antes de o intervalo suportado ser fixado podem ter 4
 * períodos gravados — um valor que o sistema nunca chegou a honrar (comportava-se
 * sempre como 3). Mostra-se o valor real para o formulário não abrir em branco
 * nem falhar na validação ao guardar.
 */
function supportedPeriods(stored: unknown): number {
  return normalizeEvaluationPeriods(stored) ?? schoolSettingDefaults.evaluationPeriods;
}

// Sem SVG: o bucket é público e um SVG pode levar código.
const LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
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
  const [motto, setMotto] = useState("");
  const [schoolType, setSchoolType] = useState("");
  const [philosophy, setPhilosophy] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const schoolQuery = useQuery({
    queryKey: ["school", "settings"],
    queryFn: () => getSchoolSettings() as Promise<SchoolSettingsBundle>,
    staleTime: 5 * 60_000,
  });
  const calendarQuery = useQuery({
    queryKey: ["calendar", "events", "settings"],
    queryFn: () =>
      listCalendarEvents({ data: { limit: 8, includePast: true } }) as Promise<
        CalendarEventSummary[]
      >,
    staleTime: 60_000,
    retry: false,
  });
  const canEdit = currentUser.role === "Administrador";
  // Memoizado: o objecto era reconstruído a cada render, o que fazia o useMemo
  // que o consome (detecção de alterações por guardar) recalcular sempre.
  const baselineInstitution: Institution = useMemo(
    () =>
      schoolQuery.data
        ? {
            nome: schoolQuery.data.name,
            nif: schoolQuery.data.nif ?? "",
            diretor: schoolQuery.data.director_name ?? "",
            telefone: schoolQuery.data.phone ?? "",
            email: schoolQuery.data.email ?? "",
            endereco: schoolQuery.data.address ?? "",
            ...locationFields(schoolQuery.data),
          }
        : initialInstitution,
    [schoolQuery.data],
  );

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
      ...locationFields(school),
    });
    setAnoLectivo(school.academic_year ?? schoolSettingDefaults.academicYear);
    setMoeda(school.currency || schoolSettingDefaults.currency);
    setTrimestres(String(supportedPeriods(school.evaluation_periods)));
    setMediaMinima([school.passing_grade ?? schoolSettingDefaults.passingGrade]);
    setLogoUrl(school.branding?.logo_url ?? "");
    setMotto(school.branding?.motto ?? "");
    setSchoolType(school.institution?.school_type ?? "");
    setPhilosophy(school.institution?.philosophy ?? "");
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
      trimestres !== String(supportedPeriods(schoolQuery.data?.evaluation_periods)) ||
      mediaMinima[0] !== (schoolQuery.data?.passing_grade ?? schoolSettingDefaults.passingGrade) ||
      logoUrl !== (schoolQuery.data?.branding?.logo_url ?? "") ||
      motto !== (schoolQuery.data?.branding?.motto ?? "") ||
      schoolType !== (schoolQuery.data?.institution?.school_type ?? "") ||
      philosophy !== (schoolQuery.data?.institution?.philosophy ?? "");
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
    motto,
    schoolType,
    philosophy,
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
    setTrimestres(String(supportedPeriods(schoolQuery.data?.evaluation_periods)));
    setMediaMinima([schoolQuery.data?.passing_grade ?? schoolSettingDefaults.passingGrade]);
    setLogoUrl(schoolQuery.data?.branding?.logo_url ?? "");
    setMotto(schoolQuery.data?.branding?.motto ?? "");
    setSchoolType(schoolQuery.data?.institution?.school_type ?? "");
    setPhilosophy(schoolQuery.data?.institution?.philosophy ?? "");
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
    const geo = parseGeoPoint(parsed.data.gps);
    const point = geo === "invalid" ? null : geo;
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
          province: parsed.data.provincia,
          municipality: parsed.data.municipio,
          commune: parsed.data.comuna,
          neighborhood: parsed.data.bairro,
          latitude: point ? point.latitude : null,
          longitude: point ? point.longitude : null,
          academicYear: anoLectivo,
          currency: moeda,
          evaluationPeriods: Number(trimestres),
          passingGrade: mediaMinima[0] ?? schoolSettingDefaults.passingGrade,
          preferences: toggles,
          logoUrl: logoUrl.trim() || "",
          motto: motto.trim() || "",
          schoolType: schoolType || undefined,
          philosophy: philosophy.trim() || "",
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
      toast.error("Use PNG, JPG ou WebP.");
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
        <h5 className="text-xs font-bold text-muted-foreground">Atalhos</h5>
        <ModuleShortcutsRow />
      </div>
      <div className="space-y-4">
        <h5 className="text-xs font-bold text-muted-foreground">Dados da instituição</h5>
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
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="school-motto">Lema da Escola</Label>
              <Input
                id="school-motto"
                value={motto}
                onChange={(event) => setMotto(event.target.value)}
                disabled={!canEdit}
                maxLength={160}
                placeholder="Ex.: Educar para transformar"
              />
              <p className="text-xs text-muted-foreground">
                Mostrado na barra lateral, abaixo do nome da escola.
              </p>
            </div>
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="school-type">Natureza da instituição</Label>
              <Select value={schoolType} onValueChange={setSchoolType} disabled={!canEdit}>
                <SelectTrigger id="school-type">
                  <SelectValue placeholder="Por definir" />
                </SelectTrigger>
                <SelectContent>
                  {angolaSchoolTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 pt-2">
              <Label htmlFor="school-philosophy">Filosofia educativa</Label>
              <Textarea
                id="school-philosophy"
                value={philosophy}
                onChange={(event) => setPhilosophy(event.target.value)}
                disabled={!canEdit}
                maxLength={600}
                rows={4}
                placeholder="Princípios e projecto educativo que orientam a escola."
              />
              <p className="text-xs text-muted-foreground">
                Guardado na ficha da instituição. Ainda não é impresso em nenhum documento.
              </p>
            </div>
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
        <h5 className="text-xs font-bold text-muted-foreground">Ano lectivo</h5>
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
                {["2", "3"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v} períodos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Aplica-se às pautas e ao lançamento de notas. O Ensino Superior mantém o seu regime
              semestral próprio.
            </p>
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
            {(calendarQuery.data ?? []).map((event) => {
              const life = termLifecycle(event.event_date, event.ends_on, todayInLuanda());
              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm"
                >
                  <span>
                    <Link
                      to="/calendario"
                      search={{ dia: event.event_date }}
                      className="font-semibold hover:underline"
                    >
                      {event.title}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {termLifecycleLabels[life]}
                    </span>
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT", {
                      day: "2-digit",
                      month: "short",
                    })}
                    {event.ends_on
                      ? ` → ${new Date(`${event.ends_on}T00:00:00`).toLocaleDateString("pt-PT", {
                          day: "2-digit",
                          month: "short",
                        })}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-1">
        <h5 className="text-xs font-bold text-muted-foreground">Notificações</h5>
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
