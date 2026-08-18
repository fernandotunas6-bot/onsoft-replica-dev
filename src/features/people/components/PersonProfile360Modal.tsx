import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Calendar,
  Clock,
  FileCheck,
  FileText,
  FolderOpen,
  GraduationCap,
  History,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
  Building,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DialogExpandButton, useExpandableDialog } from "@/features/arquivos/dialog-expand";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { getPerson, updatePersonStatus, updatePerson } from "@/features/people/server";
import { whatsappHref } from "@/features/integrations/actions";
import { formatAngolaBi } from "@/lib/angola-identity";

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
  status?: string | null;
  roles?: string[];
  documents?: Array<{
    id: string;
    document_type: string;
    document_number: string;
    issued_at?: string | null;
    expires_at?: string | null;
    file_id?: string | null;
    file_name?: string | null;
  }>;
  created_at?: string | null;
  updated_at?: string | null;
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
};

const roleBadges: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
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
  personId,
  open,
  onOpenChange,
  onOpenEnrollment,
}: {
  personId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenEnrollment?: (personId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { expanded, toggleExpanded, contentClassName } = useExpandableDialog();
  const [activeTab, setActiveTab] = useState("visao_geral");

  const personQuery = useQuery({
    queryKey: ["people", "get", personId],
    enabled: Boolean(personId && open),
    queryFn: () => (personId ? getPerson({ data: { id: personId } }) : null),
  });

  const person = personQuery.data;

  if (!open || !personId) return null;

  const roles = person?.roles ?? [];
  const hasStudentRole = roles.includes("aluno");
  const phone = person?.phone_primary || person?.phone || "";
  const email = person?.email || "";
  const nifOrBi = person?.nif || person?.national_id || "";
  const photoUrl = person?.photo_url || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={contentClassName(
          "flex max-h-[min(94vh,860px)] w-[min(1080px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl",
        )}
      >
        <DialogExpandButton expanded={expanded} onToggle={toggleExpanded} />

        {/* CABEÇALHO 360° PREMIUM */}
        <div className="border-b border-border bg-gradient-to-r from-card via-card to-secondary/30 px-6 py-5 pr-20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <UserAvatar
                url={photoUrl}
                initials={person?.full_name?.slice(0, 2)?.toUpperCase() ?? "P"}
                className="size-16 text-xl font-bold ring-2 ring-primary/20 shadow-md"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="truncate text-xl font-extrabold text-foreground">
                    {person?.full_name ?? "Pessoa"}
                  </DialogTitle>
                  <Badge variant={person?.status === "active" ? "default" : "secondary"}>
                    {person?.status === "active" ? "Ativo no Sistema" : "Inativo"}
                  </Badge>
                </div>
                <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono font-medium">ID: {personId.slice(0, 8).toUpperCase()}</span>
                  <span>·</span>
                  <span>{calculateAge(person?.birth_date || person?.date_of_birth)}</span>
                  {nifOrBi ? (
                    <>
                      <span>·</span>
                      <span>BI/NIF: {formatAngolaBi(nifOrBi)}</span>
                    </>
                  ) : null}
                </DialogDescription>
                {/* PAPÉIS E VÍNCULOS ACUMULADOS */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {roles.length > 0 ? (
                    roles.map((r) => (
                      <Badge key={r} variant={roleBadges[r]?.variant ?? "outline"} className="text-[10px]">
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
              {hasStudentRole && onOpenEnrollment ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenEnrollment(personId);
                  }}
                  className="gap-1.5 shadow-sm"
                >
                  <GraduationCap className="size-4" />
                  Matricular Aluno
                </Button>
              ) : null}
              {phone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={whatsappHref(phone, `Olá ${person?.full_name}, contacto do SIGA.`)} target="_blank" rel="noreferrer" className="gap-1.5">
                    <MessageSquare className="size-4 text-primary" />
                    WhatsApp
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* CONTEÚDO PRINCIPAL EM ABAS 360° */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 bg-secondary/10">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="w-full flex flex-wrap h-auto p-1 bg-card border border-border rounded-xl">
              <TabsTrigger value="visao_geral" className="gap-1.5 text-xs py-2">
                <UserCheck className="size-3.5" /> Visão Geral
              </TabsTrigger>
              <TabsTrigger value="dados_pessoais" className="gap-1.5 text-xs py-2">
                <IdCard className="size-3.5" /> Dados Pessoais
              </TabsTrigger>
              <TabsTrigger value="identificacao" className="gap-1.5 text-xs py-2">
                <FileCheck className="size-3.5" /> Documentos & BI
              </TabsTrigger>
              <TabsTrigger value="contactos" className="gap-1.5 text-xs py-2">
                <Phone className="size-3.5" /> Contactos
              </TabsTrigger>
              <TabsTrigger value="vinculos" className="gap-1.5 text-xs py-2">
                <GraduationCap className="size-3.5" /> Vínculos & Matrículas
              </TabsTrigger>
              <TabsTrigger value="relacoes" className="gap-1.5 text-xs py-2">
                <Users className="size-3.5" /> Relações
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5 text-xs py-2">
                <History className="size-3.5" /> Linha do Tempo
              </TabsTrigger>
            </TabsList>

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
                  <p className="text-sm font-semibold flex items-center gap-2">
                    {hasStudentRole ? (
                      <>
                        <GraduationCap className="size-4 text-primary" />
                        Perfil Aluno Ativo
                      </>
                    ) : (
                      <>
                        <Users className="size-4 text-muted-foreground" />
                        Sem Matrícula Académica
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hasStudentRole
                      ? "Possui histórico de matrícula no ano lectivo."
                      : "Pode ser matriculado como aluno quando necessário."}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Conta de Utilizador
                  </span>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <ShieldAlert className="size-4 text-warning" />
                    Conta Sem Acesso Direto
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Login do portal pode ser ativado via e-mail ou SMS.
                  </p>
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
                    <dd className="font-medium text-sm mt-0.5">{person?.birth_date || person?.date_of_birth || "—"}</dd>
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
                    <span className="font-medium text-sm block mt-1">{person?.preferred_name || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Sexo / Género</span>
                    <span className="font-medium text-sm block mt-1">
                      {person?.sex === "male" || person?.sex === "M" ? "Masculino" : person?.sex === "female" || person?.sex === "F" ? "Feminino" : "Outro / Não especificado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Data de Nascimento</span>
                    <span className="font-medium text-sm block mt-1">{person?.birth_date || person?.date_of_birth || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Idade Calculada</span>
                    <span className="font-medium text-sm block mt-1">{calculateAge(person?.birth_date || person?.date_of_birth)}</span>
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
                          <p className="font-bold text-sm uppercase">{doc.document_type} — {doc.document_number}</p>
                          <p className="text-muted-foreground">Emissão: {doc.issued_at || "—"} · Validade: {doc.expires_at || "—"}</p>
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
                      <span className="font-bold text-sm">{phone || "Sem telefone registrado"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                    <Mail className="size-5 text-primary" />
                    <div>
                      <span className="text-muted-foreground block">Correio Eletrónico</span>
                      <span className="font-bold text-sm truncate">{email || "Sem e-mail registrado"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ABA 5: VÍNCULOS E MATRÍCULAS */}
            <TabsContent value="vinculos" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <GraduationCap className="size-4 text-primary" />
                    Histórico Temporal de Matrículas
                  </h4>
                  {hasStudentRole && onOpenEnrollment ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenEnrollment(personId);
                      }}
                      className="gap-1.5 text-xs"
                    >
                      <UserPlus className="size-3.5" /> Nova Matrícula
                    </Button>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground space-y-2">
                  <p className="font-semibold text-foreground">Regra Padrão Ed-Fi & OneRoster:</p>
                  <p>
                    A matrícula cria o vínculo temporal com o ano letivo e turma. Históricos de matrículas passadas são preservados e nunca sobrescritos.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* ABA 6: RELAÇÕES */}
            <TabsContent value="relacoes" className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  Relações Familiares & Encarregados de Educação
                </h4>
                <p className="text-xs text-muted-foreground">
                  Sem duplicação de dados: encarregados são cadastrados como Pessoas únicas e vinculados.
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
                    <span className="font-bold block text-foreground">Pessoa Registada no SIGA</span>
                    <span className="text-muted-foreground">{person?.created_at ? new Date(person.created_at).toLocaleDateString("pt-AO") : "Data inicial"}</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
