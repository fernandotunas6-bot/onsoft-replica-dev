import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Calendar,
  Camera,
  Clock,
  FileCheck,
  FileText,
  FolderOpen,
  GraduationCap,
  History,
  IdCard,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Building,
  CheckCircle2,
  XCircle,
  X,
  ExternalLink,
  MessageSquare,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ModalShell, ModalSidebar, type ModalSidebarItem } from "@/components/ui/modal-system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { uploadPersonPhotoToLibrary } from "@/features/arquivos/apply-person-photo";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import {
  getPerson,
  setPersonInstitutionRoles,
  updatePersonStatus,
  updatePerson,
} from "@/features/people/server";
import { whatsappHref } from "@/features/integrations/actions";
import { formatAngolaBi } from "@/lib/angola-identity";
import { kwanza } from "@/lib/currency";
import { angolaProvinces } from "@/lib/angola-territory";
import { personInstitutionRoleOptions } from "@/features/people/schemas";

export type PersonRecord = {
  id: string;
  school_id?: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  photo_url?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  birth_date?: string | null;
  national_id?: string | null;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_primary?: string | null;
  province?: string | null;
  municipality?: string | null;
  commune?: string | null;
  address?: string | null;
  status?: string | null;
  roles?: string[];
  documents?: Array<{
    id: string;
    document_type: string;
    document_number: string;
    issued_at?: string | null;
    expires_at?: string | null;
  }>;
  academic_summary?: {
    total_enrollments: number;
    active_enrollment: {
      id: string;
      school_class_id: string | null;
      class_name: string | null;
      course_name: string | null;
      academic_year_name: string | null;
      status: string;
    } | null;
  };
  financial_summary?: {
    balance: number;
    overdue_count: number;
    currency: string;
  };
  has_contact_email?: boolean;
  created_at?: string;
};

const roleLabels: Record<string, string> = {
  aluno: "Aluno",
  encarregado: "Encarregado de Educação",
  professor: "Docente / Professor",
  funcionario: "Funcionário / Colaborador",
  diretor: "Diretor Escolar",
  coordenador: "Coordenador Pedagógico",
  utilizador: "Utilizador com Acesso",
  fornecedor: "Fornecedor Institucional",
  contacto_institucional: "Contacto Institucional",
};

const roleBadges: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  aluno: { label: "Aluno", variant: "default" },
  encarregado: { label: "Encarregado", variant: "secondary" },
  professor: { label: "Professor", variant: "outline" },
  funcionario: { label: "Funcionário", variant: "outline" },
  diretor: { label: "Diretor", variant: "destructive" },
  coordenador: { label: "Coordenador", variant: "secondary" },
};

function calculateAge(birthDate?: string | null): string {
  if (!birthDate) return "—";
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  return `${age} anos`;
}

export function PersonProfile360Modal({
  open,
  onOpenChange,
  personId,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string | null;
  onAction?: (action: "enroll", person: PersonRecord) => void;
}) {
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const [activeTab, setActiveTab] = useState("visao_geral");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleEditing, setRoleEditing] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [institutionRoleDraft, setInstitutionRoleDraft] = useState<string[]>([]);
  const [editValues, setEditValues] = useState({
    fullName: "",
    email: "",
    phone: "",
    nif: "",
    province: "",
    municipality: "",
    commune: "",
    address: "",
  });

  const personQuery = useQuery({
    queryKey: ["people", "get", personId],
    enabled: Boolean(personId && open),
    queryFn: () => (personId ? getPerson({ data: { id: personId } }) : null),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const person = personQuery.data as PersonRecord | undefined;

  if (!open || !personId) return null;

  const roles = person?.roles ?? [];
  const hasStudentRole = roles.includes("aluno");
  const phone = person?.phone_primary || person?.phone || "";
  const email = person?.email || "";
  const nifOrBi = person?.nif || person?.national_id || "";
  const photoUrl = person?.photo_url || null;

  const handleDirectPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !personId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor seleccione uma imagem válida (PNG, JPEG ou WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem não pode ultrapassar 5 MB.");
      return;
    }

    if (!account.schoolId) {
      toast.error("Sem escola activa para associar a fotografia.");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      await uploadPersonPhotoToLibrary({
        file,
        personId,
        schoolId: account.schoolId,
        ownerUserId: account.id,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["people", "detail", personId] }),
        queryClient.invalidateQueries({ queryKey: ["people"] }),
        queryClient.invalidateQueries({ queryKey: ["students"] }),
      ]);

      toast.success("Foto de perfil actualizada com sucesso!");
    } catch (err) {
      toast.error("Erro ao actualizar a foto de perfil", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const sidebarItems: ModalSidebarItem[] = [
    { value: "visao_geral", label: "Visão Geral", icon: UserCheck },
    { value: "dados_pessoais", label: "Dados Pessoais", icon: IdCard },
    { value: "identificacao", label: "Documentos & BI", icon: FileCheck },
    { value: "contactos", label: "Contactos", icon: Phone },
    { value: "vinculos", label: "Vínculos & Matrículas", icon: GraduationCap },
    ...(hasStudentRole ? [{ value: "financeiro", label: "Financeiro", icon: Wallet }] : []),
    { value: "relacoes", label: "Relações", icon: Users },
    { value: "timeline", label: "Linha do Tempo", icon: History },
  ];

  const handleStartEdit = () => {
    if (!person) return;
    setEditValues({
      fullName: person.full_name ?? "",
      email: email,
      phone: phone,
      nif: nifOrBi,
      province: person.province ?? "",
      municipality: person.municipality ?? "",
      commune: person.commune ?? "",
      address: person.address ?? "",
    });
    setActiveTab("dados_pessoais");
    setEditing(true);
  };

  const handleCancelEdit = () => setEditing(false);

  const handleSaveEdit = async () => {
    if (!personId || !editValues.fullName.trim()) {
      toast.error("O nome completo é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      await updatePerson({
        data: {
          personId,
          fullName: editValues.fullName.trim(),
          email: editValues.email.trim(),
          phone: editValues.phone.trim(),
          nif: editValues.nif.trim(),
          province: editValues.province.trim(),
          municipality: editValues.municipality.trim(),
          commune: editValues.commune.trim(),
          address: editValues.address.trim(),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["people", "get", personId] });
      toast.success("Ficha actualizada.");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível guardar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartRoleEdit = () => {
    setInstitutionRoleDraft(
      roles.filter((role) => (personInstitutionRoleOptions as readonly string[]).includes(role)),
    );
    setRoleEditing(true);
  };

  const handleSaveRoles = async () => {
    if (!personId) return;
    setSavingRoles(true);
    try {
      await setPersonInstitutionRoles({
        data: {
          personId,
          roles: institutionRoleDraft as Array<(typeof personInstitutionRoleOptions)[number]>,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["people", "get", personId] });
      toast.success("Vínculos institucionais actualizados.");
      setRoleEditing(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível actualizar os vínculos.",
      );
    } finally {
      setSavingRoles(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="2xl"
      hasUnsavedChanges={editing || roleEditing}
    >
      <div className="flex h-full max-h-[88vh] flex-col overflow-hidden">
        {/* CABEÇALHO 360° PREMIUM */}
        <div className="border-b border-border bg-gradient-to-r from-card via-card to-secondary/30 px-6 py-5 pr-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative group shrink-0">
                <UserAvatar
                  url={photoUrl}
                  initials={person?.full_name?.slice(0, 2)?.toUpperCase() ?? "P"}
                  className="size-16 text-xl font-bold ring-2 ring-primary/20 shadow-md transition-transform group-hover:scale-[1.02]"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  title="Alterar foto de perfil"
                  className="absolute -bottom-1 -right-1 size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow hover:scale-110 active:scale-95 transition-all cursor-pointer ring-2 ring-background disabled:opacity-50"
                >
                  {isUploadingPhoto ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Camera className="size-3" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleDirectPhotoUpload}
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-extrabold text-foreground">
                    {person?.full_name ?? "Pessoa"}
                  </h2>
                  <Badge variant={person?.status === "active" ? "default" : "secondary"}>
                    {person?.status === "active" ? "Ativo no Sistema" : "Inativo"}
                  </Badge>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono font-medium">
                    ID: {personId.slice(0, 8).toUpperCase()}
                  </span>
                  <span>·</span>
                  <span>{calculateAge(person?.birth_date || person?.date_of_birth)}</span>
                  {nifOrBi ? (
                    <>
                      <span>·</span>
                      <span>BI/NIF: {formatAngolaBi(nifOrBi)}</span>
                    </>
                  ) : null}
                </p>
                {/* PAPÉIS E VÍNCULOS ACUMULADOS */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {roles.length > 0 ? (
                    roles.map((r: string) => (
                      <Badge
                        key={r}
                        variant={roleBadges[r]?.variant ?? "outline"}
                        className="text-[10px]"
                      >
                        {roleLabels[r] ?? r}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Sem Vínculo Específico
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* AÇÕES RÁPIDAS CONTEXTUAIS */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {hasStudentRole && onAction && person ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onAction("enroll", person);
                  }}
                  className="gap-1.5 shadow-sm"
                >
                  <GraduationCap className="size-4" />
                  Matricular Aluno
                </Button>
              ) : null}
              {phone ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a
                    href={whatsappHref(phone, `Olá ${person?.full_name}, contacto do SIGA.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="gap-1.5"
                  >
                    <MessageSquare className="size-4 text-primary" />
                    WhatsApp
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Editar ficha"
                title="Editar ficha"
                onClick={handleStartEdit}
              >
                <Pencil className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              (editing || roleEditing) &&
              !window.confirm("Existem alterações não guardadas. Fechar sem guardar?")
            ) {
              return;
            }
            setEditing(false);
            setRoleEditing(false);
            onOpenChange(false);
          }}
          aria-label="Fechar"
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {/* CORPO: SIDEBAR CONTEXTUAL + CONTEÚDO (PROMPT MASTER §5/§6) */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex min-h-0 flex-1 flex-col sm:flex-row"
        >
          <ModalSidebar
            items={sidebarItems}
            header={
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {person?.full_name ?? "Pessoa"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {roles.length ? roles.map((r) => roleLabels[r] ?? r).join(" · ") : "Sem vínculo"}
                </p>
              </div>
            }
          />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-secondary/10 p-6">
            {/* ABA 1: VISÃO GERAL */}
            <TabsContent value="visao_geral" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Estado de Identidade
                  </span>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-primary" />
                    Pessoa Cadastrada e Validada
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cadastro único universal no núcleo de dados da instituição.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Vínculo Académico
                  </span>
                  {hasStudentRole && person?.academic_summary?.active_enrollment ? (
                    <>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <GraduationCap className="size-4 text-primary" />
                        {person.academic_summary.active_enrollment.class_name ?? "Matrícula activa"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          person.academic_summary.active_enrollment.course_name,
                          person.academic_summary.active_enrollment.academic_year_name,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Matriculado no ano lectivo em curso."}
                      </p>
                    </>
                  ) : hasStudentRole ? (
                    <>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Users className="size-4 text-muted-foreground" />
                        Aluno sem matrícula activa
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {person?.academic_summary?.total_enrollments
                          ? `${person.academic_summary.total_enrollments} matrícula(s) no histórico.`
                          : "Ainda sem matrícula registada."}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Users className="size-4 text-muted-foreground" />
                        Sem Vínculo Académico
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pode ser matriculado como aluno quando necessário.
                      </p>
                    </>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Contacto para Acesso
                  </span>
                  {person?.has_contact_email ? (
                    <>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <ShieldCheck className="size-4 text-success" />
                        Tem E-mail Registado
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pode receber convite de acesso ao portal por e-mail.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <ShieldAlert className="size-4 text-warning" />
                        Sem E-mail Registado
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Adicione um e-mail para poder convidar esta pessoa para o portal.
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" />
                  Resumo de Atividade & Vida Escolar
                </h4>
                <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Nome Completo</dt>
                    <dd className="font-medium text-sm mt-0.5">{person?.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Data de Nascimento</dt>
                    <dd className="font-medium text-sm mt-0.5">
                      {person?.birth_date || person?.date_of_birth || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Telefone Principal</dt>
                    <dd className="font-medium text-sm mt-0.5">{phone || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Correio Eletrónico</dt>
                    <dd className="font-medium text-sm mt-0.5 truncate">{email || "—"}</dd>
                  </div>
                </dl>
              </div>
            </TabsContent>

            {/* ABA 2: DADOS PESSOAIS */}
            <TabsContent value="dados_pessoais" className="space-y-4">
              {editing ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-sm space-y-4">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Pencil className="size-4 text-primary" />A editar ficha
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="edit-full-name" className="text-xs">
                        Nome completo
                      </Label>
                      <Input
                        id="edit-full-name"
                        value={editValues.fullName}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, fullName: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-phone" className="text-xs">
                        Telefone
                      </Label>
                      <Input
                        id="edit-phone"
                        value={editValues.phone}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-email" className="text-xs">
                        E-mail
                      </Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editValues.email}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="edit-nif" className="text-xs">
                        BI / NIF
                      </Label>
                      <AngolaIdentityField
                        id="edit-nif"
                        value={editValues.nif}
                        onChange={(value) => setEditValues((prev) => ({ ...prev, nif: value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-province" className="text-xs">
                        Província
                      </Label>
                      <select
                        id="edit-province"
                        value={editValues.province}
                        onChange={(e) =>
                          setEditValues((prev) => ({
                            ...prev,
                            province: e.target.value,
                            municipality: "",
                            commune: "",
                          }))
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">Seleccionar província</option>
                        {angolaProvinces.map((province) => (
                          <option key={province} value={province}>
                            {province}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-municipality" className="text-xs">
                        Município
                      </Label>
                      <Input
                        id="edit-municipality"
                        value={editValues.municipality}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, municipality: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-commune" className="text-xs">
                        Comuna / localidade
                      </Label>
                      <Input
                        id="edit-commune"
                        value={editValues.commune}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, commune: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-address" className="text-xs">
                        Morada detalhada
                      </Label>
                      <Input
                        id="edit-address"
                        value={editValues.address}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, address: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="gap-1.5"
                    >
                      {saving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Guardar
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <IdCard className="size-4 text-primary" />
                  Informação Demográfica
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Nome Completo</span>
                    <span className="font-medium text-sm block mt-1">{person?.full_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Nome Preferencial</span>
                    <span className="font-medium text-sm block mt-1">
                      {person?.preferred_name || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Sexo / Género</span>
                    <span className="font-medium text-sm block mt-1">
                      {person?.sex === "male" || person?.sex === "M"
                        ? "Masculino"
                        : person?.sex === "female" || person?.sex === "F"
                          ? "Feminino"
                          : "Outro / Não especificado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Data de Nascimento</span>
                    <span className="font-medium text-sm block mt-1">
                      {person?.birth_date || person?.date_of_birth || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Idade Calculada</span>
                    <span className="font-medium text-sm block mt-1">
                      {calculateAge(person?.birth_date || person?.date_of_birth)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Nacionalidade</span>
                    <span className="font-medium text-sm block mt-1">Angolana</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ABA 3: IDENTIFICAÇÃO E DOCUMENTOS */}
            <TabsContent value="identificacao" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <FileCheck className="size-4 text-primary" />
                    Documentos de Identificação Civil
                  </h4>
                </div>
                {person?.documents && person.documents.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {person.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <p className="font-bold text-sm uppercase">
                            {doc.document_type} — {doc.document_number}
                          </p>
                          <p className="text-muted-foreground">
                            Emissão: {doc.issued_at || "—"} · Validade: {doc.expires_at || "—"}
                          </p>
                        </div>
                        <Badge variant="outline">Verificado</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    Nenhum documento civil registrado. Adicione o BI ou Cédula de Nascimento.
                  </p>
                )}
              </div>
            </TabsContent>

            {/* ABA 4: CONTACTOS */}
            <TabsContent value="contactos" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Phone className="size-4 text-primary" />
                  Canais de Comunicação
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                    <Phone className="size-5 text-primary" />
                    <div>
                      <span className="text-muted-foreground block">Telefone Principal</span>
                      <span className="font-bold text-sm">
                        {phone || "Sem telefone registrado"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                    <Mail className="size-5 text-primary" />
                    <div>
                      <span className="text-muted-foreground block">Correio Eletrónico</span>
                      <span className="font-bold text-sm truncate">
                        {email || "Sem e-mail registrado"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/20 sm:col-span-2">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <span className="text-muted-foreground block">Localização</span>
                      <span className="font-bold text-sm">
                        {[person?.address, person?.commune, person?.municipality, person?.province]
                          .filter(Boolean)
                          .join(" · ") || "Sem localização registada"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ABA 5: VÍNCULOS E MATRÍCULAS */}
            <TabsContent value="vinculos" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <GraduationCap className="size-4 text-primary" />
                    Vínculos institucionais & matrículas
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleStartRoleEdit}
                      className="gap-1.5 text-xs"
                    >
                      <UserCheck className="size-3.5" /> Gerir vínculos
                    </Button>
                    {hasStudentRole && onAction && person ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false);
                          onAction("enroll", person);
                        }}
                        className="gap-1.5 text-xs"
                      >
                        <UserPlus className="size-3.5" /> Nova Matrícula
                      </Button>
                    ) : null}
                  </div>
                </div>

                {roleEditing ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Papéis institucionais declarativos
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Aluno e Professor são controlados pelos respectivos registos de domínio.
                        Aqui pode acumular os demais vínculos sem criar uma nova Pessoa.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {personInstitutionRoleOptions.map((role) => {
                        const checked = institutionRoleDraft.includes(role);
                        return (
                          <label
                            key={role}
                            className="flex items-center gap-2 rounded-md border border-border bg-background p-2.5 text-xs"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                setInstitutionRoleDraft((current) =>
                                  value
                                    ? [...new Set([...current, role])]
                                    : current.filter((item) => item !== role),
                                )
                              }
                            />
                            <span>{roleLabels[role] ?? role}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingRoles}
                        onClick={() => setRoleEditing(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingRoles}
                        onClick={() => void handleSaveRoles()}
                      >
                        {savingRoles ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Guardar vínculos
                      </Button>
                    </div>
                  </div>
                ) : null}

                {hasStudentRole && person?.academic_summary?.active_enrollment ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs space-y-1.5">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-primary" /> Matrícula activa
                    </p>
                    <p className="text-muted-foreground">
                      Turma:{" "}
                      <strong className="text-foreground">
                        {person.academic_summary.active_enrollment.class_name ?? "—"}
                      </strong>
                      {person.academic_summary.active_enrollment.course_name
                        ? ` · Curso: ${person.academic_summary.active_enrollment.course_name}`
                        : ""}
                      {person.academic_summary.active_enrollment.academic_year_name
                        ? ` · Ano lectivo: ${person.academic_summary.active_enrollment.academic_year_name}`
                        : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {person.academic_summary.total_enrollments} matrícula(s) no histórico total.
                    </p>
                  </div>
                ) : hasStudentRole ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-xs text-center text-muted-foreground space-y-2">
                    <p>
                      {person?.academic_summary?.total_enrollments
                        ? "Sem matrícula activa neste momento."
                        : "Este aluno ainda não possui nenhuma matrícula."}
                    </p>
                    {onAction && person ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs"
                        onClick={() => {
                          onOpenChange(false);
                          onAction("enroll", person);
                        }}
                      >
                        <UserPlus className="size-3.5" /> Criar Matrícula
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground">
                    Esta pessoa ainda não tem vínculo de aluno. Use "Matricular Aluno" para criar
                    um.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ABA FINANCEIRO */}
            {hasStudentRole ? (
              <TabsContent value="financeiro" className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Wallet className="size-4 text-primary" />
                    Situação Financeira
                  </h4>
                  {person?.financial_summary ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div
                        className={`rounded-lg border p-4 space-y-1 ${
                          person.financial_summary.balance > 0
                            ? "border-warning/30 bg-warning/5"
                            : "border-success/30 bg-success/5"
                        }`}
                      >
                        <span className="text-xs text-muted-foreground block">Saldo em Aberto</span>
                        <span className="text-lg font-bold block">
                          {kwanza(person.financial_summary.balance)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {person.financial_summary.balance > 0
                            ? "Valor pendente de pagamento."
                            : "Sem valores pendentes."}
                        </span>
                      </div>
                      <div
                        className={`rounded-lg border p-4 space-y-1 ${
                          person.financial_summary.overdue_count > 0
                            ? "border-destructive/30 bg-destructive/5"
                            : "border-border bg-secondary/10"
                        }`}
                      >
                        <span className="text-xs text-muted-foreground block">
                          Facturas Vencidas
                        </span>
                        <span className="text-lg font-bold block">
                          {person.financial_summary.overdue_count}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {person.financial_summary.overdue_count > 0
                            ? "Requer atenção da Tesouraria."
                            : "Nenhuma factura em atraso."}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Sem dados financeiros disponíveis.
                    </p>
                  )}
                </div>
              </TabsContent>
            ) : null}

            {/* ABA 6: RELAÇÕES */}
            <TabsContent value="relacoes" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  Relações Familiares & Encarregados de Educação
                </h4>
                <p className="text-xs text-muted-foreground">
                  Sem duplicação de dados: encarregados são cadastrados como Pessoas únicas e
                  vinculados.
                </p>
              </div>
            </TabsContent>

            {/* ABA 7: LINHA DO TEMPO */}
            <TabsContent value="timeline" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <History className="size-4 text-primary" />
                  Histórico Auditado de Eventos
                </h4>
                <div className="space-y-3 border-l-2 border-primary/30 pl-4 text-xs">
                  <div>
                    <span className="font-bold block text-foreground">
                      Pessoa Registada no SIGA
                    </span>
                    <span className="text-muted-foreground">
                      {person?.created_at
                        ? new Date(person.created_at).toLocaleDateString("pt-AO")
                        : "Data inicial"}
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ModalShell>
  );
}
