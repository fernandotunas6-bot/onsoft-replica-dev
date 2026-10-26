import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  FileCheck,
  GraduationCap,
  History,
  IdCard,
  LoaderCircle,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ModalSidebar, type ModalSidebarItem } from "@/components/ui/modal-system";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";
import { Badge } from "@/components/ui/badge";
import { IconChip } from "@/components/ui/icon-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAvatar } from "@/components/ui/user-avatar";
import { FilePickerModal } from "@/features/arquivos/FilePickerModal";
import { listSchoolFiles } from "@/features/arquivos/server";
import { formatFileSize } from "@/features/arquivos/kinds";
import { uploadPersonPhotoToLibrary } from "@/features/arquivos/apply-person-photo";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { getPerson, setPersonInstitutionRoles, updatePerson } from "@/features/people/server";
import type { PersonRecord } from "@/features/people/person-record";
import { whatsappHref } from "@/features/integrations/actions";
import { formatAngolaBi } from "@/lib/angola-identity";
import { kwanza } from "@/lib/currency";
import { angolaProvinces } from "@/lib/angola-territory";
import { personInstitutionRoleOptions } from "@/features/people/schemas";

export const Route = createFileRoute("/pessoas/$personId")({
  head: () => ({
    meta: [
      { title: "Ficha da Pessoa · SIGA" },
      {
        name: "description",
        content:
          "Ficha 360º da pessoa: dados pessoais, documentos, contactos, vínculos institucionais, situação financeira e histórico.",
      },
      { property: "og:title", content: "Ficha da Pessoa · SIGA" },
      {
        property: "og:description",
        content: "Dados pessoais, documentos, vínculos e situação financeira da pessoa.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PersonDetail,
});

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

function NotFoundOrError({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="flex flex-col items-center rounded-xl border border-border bg-card p-10 text-center shadow-soft">
        <IconChip icon={Users} tone="muted" size="md" className="mb-3" />
        <h1 className="font-display text-xl font-bold">{title}</h1>
        <Button asChild className="mt-6">
          <Link to="/pessoas">Voltar à lista</Link>
        </Button>
      </div>
    </AppShell>
  );
}

function PersonDetail() {
  const { personId } = Route.useParams();
  const navigate = useNavigate();
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
    queryFn: () => getPerson({ data: { id: personId } }),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [personalDocumentsOpen, setPersonalDocumentsOpen] = useState(false);

  const personalFilesQuery = useQuery({
    queryKey: ["arquivos", "person-documents", account.schoolId, personId],
    enabled: Boolean(account.schoolId && activeTab === "identificacao"),
    queryFn: () =>
      listSchoolFiles({
        data: { area: "secretaria", relatedPersonId: personId, limit: 48 },
      }),
    staleTime: 20_000,
  });

  const person = personQuery.data as PersonRecord | undefined;

  if (personQuery.isLoading) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
          A carregar ficha da pessoa…
        </div>
      </AppShell>
    );
  }

  if (personQuery.isError) {
    return <NotFoundOrError title="Não foi possível carregar a ficha" />;
  }

  if (!person) return <NotFoundOrError title="Pessoa não encontrada" />;

  const roles = person.roles ?? [];
  const hasStudentRole = roles.includes("aluno");
  const phone = person.phone_primary || person.phone || "";
  const email = person.email || "";
  const nifOrBi = person.nif || person.national_id || "";
  const photoUrl = person.photo_url || null;

  const goBack = () => {
    if (
      (editing || roleEditing) &&
      !window.confirm("Existem alterações não guardadas. Sair sem guardar?")
    ) {
      return;
    }
    void navigate({ to: "/pessoas" });
  };

  const goEnroll = () => {
    window.location.href = `/alunos?action=matricular&personId=${person.id}`;
  };

  const handleDirectPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file || !personId || isUploadingPhoto) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
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
    setEditValues({
      fullName: person.full_name ?? "",
      email,
      phone,
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
          includesGeography: true,
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
    <AppShell>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" onClick={goBack}>
          <ArrowLeft className="size-4" /> Pessoas
        </Button>

        <div className="rounded-xl border border-border bg-gradient-to-r from-card via-card to-secondary/30 shadow-soft">
          <div className="px-6 py-5">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="group relative shrink-0">
                  <UserAvatar
                    url={photoUrl}
                    initials={person.full_name?.slice(0, 2)?.toUpperCase() ?? "P"}
                    className="size-16 text-xl font-bold shadow-md ring-2 ring-primary/20 transition-transform group-hover:scale-[1.02]"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    title="Alterar foto de perfil"
                    className="absolute -bottom-1 -right-1 flex size-6 cursor-pointer items-center justify-center rounded-md bg-primary text-primary-foreground shadow ring-2 ring-background transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Camera className="size-3" />
                    )}
                  </button>
                  <input
                    aria-label="Carregar fotografia"
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleDirectPhotoUpload}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate font-display text-xl font-extrabold text-foreground">
                      {person.full_name}
                    </h1>
                    <Badge variant={person.status === "active" ? "default" : "secondary"}>
                      {person.status === "active" ? "Ativo no Sistema" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono font-medium">
                      ID: {personId.slice(0, 8).toUpperCase()}
                    </span>
                    <span>·</span>
                    <span>{calculateAge(person.birth_date || person.date_of_birth)}</span>
                    {nifOrBi ? (
                      <>
                        <span>·</span>
                        <span>BI/NIF: {formatAngolaBi(nifOrBi)}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {roles.length > 0 ? (
                      roles.map((r: string) => (
                        <Badge
                          key={r}
                          variant={roleBadges[r]?.variant ?? "outline"}
                          className="text-[11px]"
                        >
                          {roleLabels[r] ?? r}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="text-[11px] text-muted-foreground">
                        Sem Vínculo Específico
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {hasStudentRole ? (
                  <Button type="button" size="sm" onClick={goEnroll} className="gap-1.5 shadow-sm">
                    <GraduationCap className="size-4" />
                    Matricular Aluno
                  </Button>
                ) : null}
                {phone ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a
                      href={whatsappHref(phone, `Olá ${person.full_name}, contacto do SIGA.`)}
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
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft sm:flex-row"
        >
          <ModalSidebar
            items={sidebarItems}
            header={
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{person.full_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {roles.length ? roles.map((r) => roleLabels[r] ?? r).join(" · ") : "Sem vínculo"}
                </p>
              </div>
            }
          />
          <div className="min-h-0 flex-1 space-y-4 bg-secondary/10 p-6">
            <TabsContent value="visao_geral" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    Estado de Identidade
                  </span>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="size-4 text-primary" />
                    Pessoa Cadastrada e Validada
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cadastro único universal no núcleo de dados da instituição.
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    Vínculo Académico
                  </span>
                  {hasStudentRole && person.academic_summary?.active_enrollment ? (
                    <>
                      <p className="flex items-center gap-2 text-sm font-semibold">
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
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Users className="size-4 text-muted-foreground" />
                        Aluno sem matrícula activa
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {person.academic_summary?.total_enrollments
                          ? `${person.academic_summary.total_enrollments} matrícula(s) no histórico.`
                          : "Ainda sem matrícula registada."}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Users className="size-4 text-muted-foreground" />
                        Sem Vínculo Académico
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pode ser matriculado como aluno quando necessário.
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
                  <span className="block text-xs font-semibold text-muted-foreground">
                    Contacto para Acesso
                  </span>
                  {person.has_contact_email ? (
                    <>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <ShieldCheck className="size-4 text-success" />
                        Tem E-mail Registado
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pode receber convite de acesso ao portal por e-mail.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 text-sm font-semibold">
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

              <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <BookOpen className="size-4 text-primary" />
                  Resumo de Atividade & Vida Escolar
                </h4>
                <dl className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Nome Completo</dt>
                    <dd className="mt-0.5 text-sm font-medium">{person.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Data de Nascimento</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {person.birth_date || person.date_of_birth || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Telefone Principal</dt>
                    <dd className="mt-0.5 text-sm font-medium">{phone || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Correio Eletrónico</dt>
                    <dd className="mt-0.5 truncate text-sm font-medium">{email || "—"}</dd>
                  </div>
                </dl>
              </div>
            </TabsContent>

            <TabsContent value="dados_pessoais" className="space-y-4">
              {editing ? (
                <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
                  <h4 className="flex items-center gap-2 text-sm font-bold">
                    <Pencil className="size-4 text-primary" />A editar ficha
                  </h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      Guardar
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <IdCard className="size-4 text-primary" />
                  Informação Demográfica
                </h4>
                <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 md:grid-cols-3">
                  <div>
                    <span className="block text-muted-foreground">Nome Completo</span>
                    <span className="mt-1 block text-sm font-medium">{person.full_name}</span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Nome Preferencial</span>
                    <span className="mt-1 block text-sm font-medium">
                      {person.preferred_name || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Sexo / Género</span>
                    <span className="mt-1 block text-sm font-medium">
                      {person.sex === "male" || person.sex === "M"
                        ? "Masculino"
                        : person.sex === "female" || person.sex === "F"
                          ? "Feminino"
                          : "Outro / Não especificado"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Data de Nascimento</span>
                    <span className="mt-1 block text-sm font-medium">
                      {person.birth_date || person.date_of_birth || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Idade Calculada</span>
                    <span className="mt-1 block text-sm font-medium">
                      {calculateAge(person.birth_date || person.date_of_birth)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Nacionalidade</span>
                    <span className="mt-1 block text-sm font-medium">Angolana</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="identificacao" className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-sm font-bold">
                    <FileCheck className="size-4 text-primary" />
                    Documentos de Identificação Civil
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPersonalDocumentsOpen(true)}
                  >
                    <Upload className="mr-2 size-4" /> Carregar documento pessoal
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Na biblioteca reservada, carregue o BI, passaporte, certidão ou certificado. No
                  formulário de classificação, associe o ficheiro a esta pessoa e mantenha a
                  visibilidade privada. O carregamento não verifica automaticamente a identidade.
                </p>
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm font-semibold">Ficheiros associados a esta pessoa</p>
                  {personalFilesQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">A carregar documentos…</p>
                  ) : personalFilesQuery.isError ? (
                    <p className="text-xs text-destructive">
                      Não foi possível consultar os ficheiros.
                    </p>
                  ) : personalFilesQuery.data?.files.length ? (
                    <ul className="divide-y divide-border">
                      {personalFilesQuery.data.files.map((file) => (
                        <li
                          key={file.id}
                          className="flex items-center justify-between gap-3 py-2 text-xs"
                        >
                          <span className="min-w-0 truncate font-medium">
                            {file.title || file.name}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatFileSize(file.sizeBytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nenhum ficheiro associado na Secretaria.
                    </p>
                  )}
                </div>
                {person.documents && person.documents.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {person.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <p className="text-sm font-bold">
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
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Nenhum documento civil registrado. Adicione o BI ou Cédula de Nascimento.
                  </p>
                )}
              </div>
            </TabsContent>

            <FilePickerModal
              open={personalDocumentsOpen}
              onOpenChange={(nextOpen) => {
                setPersonalDocumentsOpen(nextOpen);
                if (!nextOpen) {
                  void queryClient.invalidateQueries({
                    queryKey: ["arquivos", "person-documents", account.schoolId, personId],
                  });
                }
              }}
              area="secretaria"
              initialRelatedPersonId={personId}
            />

            <TabsContent value="contactos" className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <Phone className="size-4 text-primary" />
                  Canais de Comunicação
                </h4>
                <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                    <Phone className="size-5 text-primary" />
                    <div>
                      <span className="block text-muted-foreground">Telefone Principal</span>
                      <span className="text-sm font-bold">
                        {phone || "Sem telefone registrado"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3">
                    <Mail className="size-5 text-primary" />
                    <div>
                      <span className="block text-muted-foreground">Correio Eletrónico</span>
                      <span className="truncate text-sm font-bold">
                        {email || "Sem e-mail registrado"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3 sm:col-span-2">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <span className="block text-muted-foreground">Localização</span>
                      <span className="text-sm font-bold">
                        {[person.address, person.commune, person.municipality, person.province]
                          .filter(Boolean)
                          .join(" · ") || "Sem localização registada"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="vinculos" className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-sm font-bold">
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
                    {hasStudentRole ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={goEnroll}
                        className="gap-1.5 text-xs"
                      >
                        <UserPlus className="size-3.5" /> Nova Matrícula
                      </Button>
                    ) : null}
                  </div>
                </div>

                {roleEditing ? (
                  <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
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
                        {savingRoles ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                        Guardar vínculos
                      </Button>
                    </div>
                  </div>
                ) : null}

                {hasStudentRole && person.academic_summary?.active_enrollment ? (
                  <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-foreground">
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
                  <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    <p>
                      {person.academic_summary?.total_enrollments
                        ? "Sem matrícula activa neste momento."
                        : "Este aluno ainda não possui nenhuma matrícula."}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={goEnroll}
                    >
                      <UserPlus className="size-3.5" /> Criar Matrícula
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground">
                    Esta pessoa ainda não tem vínculo de aluno. Use "Matricular Aluno" para criar
                    um.
                  </div>
                )}
              </div>
            </TabsContent>

            {hasStudentRole ? (
              <TabsContent value="financeiro" className="space-y-4">
                <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h4 className="flex items-center gap-2 text-sm font-bold">
                    <Wallet className="size-4 text-primary" />
                    Situação Financeira
                  </h4>
                  {person.financial_summary ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div
                        className={`space-y-1 rounded-lg border p-4 ${
                          person.financial_summary.balance > 0
                            ? "border-warning/30 bg-warning/5"
                            : "border-success/30 bg-success/5"
                        }`}
                      >
                        <span className="block text-xs text-muted-foreground">Saldo em Aberto</span>
                        <span className="block text-lg font-bold">
                          {kwanza(person.financial_summary.balance)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {person.financial_summary.balance > 0
                            ? "Valor pendente de pagamento."
                            : "Sem valores pendentes."}
                        </span>
                      </div>
                      <div
                        className={`space-y-1 rounded-lg border p-4 ${
                          person.financial_summary.overdue_count > 0
                            ? "border-destructive/30 bg-destructive/5"
                            : "border-border bg-secondary/10"
                        }`}
                      >
                        <span className="block text-xs text-muted-foreground">
                          Facturas Vencidas
                        </span>
                        <span className="block text-lg font-bold">
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

            <TabsContent value="relacoes" className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <Users className="size-4 text-primary" />
                  Relações Familiares & Encarregados de Educação
                </h4>
                <p className="text-xs text-muted-foreground">
                  Sem duplicação de dados: encarregados são cadastrados como Pessoas únicas e
                  vinculados.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <History className="size-4 text-primary" />
                  Histórico Auditado de Eventos
                </h4>
                <div className="space-y-3 border-l-2 border-primary/30 pl-4 text-xs">
                  <div>
                    <span className="block font-bold text-foreground">
                      Pessoa Registada no SIGA
                    </span>
                    <span className="text-muted-foreground">
                      {person.created_at
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
    </AppShell>
  );
}
