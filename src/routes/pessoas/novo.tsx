import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  GraduationCap,
  IdCard,
  LoaderCircle,
  Phone,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { IconChip } from "@/components/ui/icon-chip";
import { createPerson, findPersonDuplicates, searchPeople } from "@/features/people/server";
import { personRelationshipTypeOptions, personRoleOptions } from "@/features/people/schemas";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";
import { EducationWorkflowVisual } from "@/components/workflows/EducationWorkflowVisual";
import { angolaProvinces } from "@/lib/angola-territory";

export const Route = createFileRoute("/pessoas/novo")({
  head: () => ({
    meta: [
      { title: "Nova Pessoa · SIGA" },
      {
        name: "description",
        content: "Cadastro único universal: identificação, contactos, documentos e vínculos.",
      },
      { property: "og:title", content: "Nova Pessoa · SIGA" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PersonWizardPage,
});

type PersonRole = (typeof personRoleOptions)[number];
type RelationshipType = (typeof personRelationshipTypeOptions)[number];

const relationshipLabels: Record<RelationshipType, string> = {
  pai: "Pai",
  mae: "Mãe",
  encarregado: "Encarregado de Educação",
  tutor: "Tutor",
  conjuge: "Cônjuge",
  irmao: "Irmão/Irmã",
  contacto_emergencia: "Contacto de Emergência",
  responsavel_financeiro: "Responsável Financeiro",
  responsavel_autorizado_buscar: "Autorizado a Buscar",
};

/**
 * Erros de validação do servidor (Zod) chegam como `.message` em JSON com
 * todos os issues — mostrar isso directamente ao utilizador violaria a
 * regra de nunca expor erros técnicos. Extrai só a primeira mensagem legível.
 */
function firstReadableErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Não foi possível criar a pessoa.";
  try {
    const parsed = JSON.parse(err.message);
    if (Array.isArray(parsed) && parsed[0]?.message) {
      return String(parsed[0].message);
    }
  } catch {
    // não era JSON — é uma mensagem normal, usar tal como está
  }
  return err.message || "Não foi possível criar a pessoa.";
}

function PersonWizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<
    Array<{
      id: string;
      full_name: string;
      score: number;
      match_reason: string;
      status: string;
    }>
  >([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "outro">("M");
  const [nifOrBi, setNifOrBi] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneAlt, setPhoneAlt] = useState("");
  const [email, setEmail] = useState("");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [commune, setCommune] = useState("");
  const [address, setAddress] = useState("");
  const [docType, setDocType] = useState<"bi" | "passaporte" | "cedula" | "outro">("bi");
  const [docNumber, setDocNumber] = useState("");
  const [roles, setRoles] = useState<PersonRole[]>(["aluno"]);
  const [createdPersonId, setCreatedPersonId] = useState<string | null>(null);

  const [guardianQuery, setGuardianQuery] = useState("");
  const [guardianResults, setGuardianResults] = useState<
    Array<{ id: string; full_name: string; phone_primary: string | null; nif: string | null }>
  >([]);
  const [searchingGuardian, setSearchingGuardian] = useState(false);
  const [selectedGuardian, setSelectedGuardian] = useState<{
    id: string;
    full_name: string;
  } | null>(null);
  const [guardianRelationship, setGuardianRelationship] = useState<RelationshipType>("encarregado");

  const handleRoleToggle = (role: PersonRole) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  useEffect(() => {
    const query = guardianQuery.trim();
    if (query.length < 2 || selectedGuardian) {
      setGuardianResults([]);
      return;
    }
    let cancelled = false;
    setSearchingGuardian(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchPeople({ data: { query, limit: 8 } });
        if (!cancelled) setGuardianResults(results);
      } catch {
        if (!cancelled) setGuardianResults([]);
      } finally {
        if (!cancelled) setSearchingGuardian(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [guardianQuery, selectedGuardian]);

  const goToList = () => void navigate({ to: "/pessoas" });
  const goToProfile = (personId: string) =>
    void navigate({ to: "/pessoas/$personId", params: { personId } });
  const goEnroll = (personId: string) => {
    window.location.href = `/alunos?action=matricular&personId=${personId}`;
  };

  const handleNextStep1 = async () => {
    if (!fullName.trim() || fullName.trim().length < 2) {
      toast.error("Preencha o nome completo da pessoa.");
      return;
    }

    setCheckingDuplicates(true);
    try {
      const duplicates = await findPersonDuplicates({
        data: {
          fullName: fullName.trim(),
          birthDate: birthDate || undefined,
          nif: nifOrBi || undefined,
          phone: phonePrimary || undefined,
          email: email || undefined,
        },
      });
      setDuplicateCheck(duplicates);
    } catch {
      setDuplicateCheck([]);
    } finally {
      setCheckingDuplicates(false);
    }
    setStep(2);
  };

  const handleSavePerson = async () => {
    if (!fullName.trim()) {
      toast.error("Nome completo é obrigatório.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createPerson({
        data: {
          person: {
            full_name: fullName.trim(),
            preferred_name: preferredName.trim() || undefined,
            birth_date: birthDate || undefined,
            sex,
            nif: nifOrBi.trim() || undefined,
            phone_primary: phonePrimary.trim() || undefined,
            phone_alternative: phoneAlt.trim() || undefined,
            email: email.trim() || undefined,
            province: province || undefined,
            municipality: municipality.trim() || undefined,
            commune: commune.trim() || undefined,
            address: address.trim() || undefined,
          },
          roles,
          documents: docNumber.trim()
            ? [{ document_type: docType, document_number: docNumber.trim() }]
            : [],
          relationships: selectedGuardian
            ? [
                {
                  related_person_id: selectedGuardian.id,
                  relationship_type: guardianRelationship,
                  authorized: true,
                },
              ]
            : [],
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["people"] });
      setCreatedPersonId(res.id);
      setStep(7);
      toast.success("Pessoa criada com sucesso no Núcleo Unificado de Identidade!");
    } catch (err) {
      toast.error(firstReadableErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const hasUnsavedChanges = Boolean(fullName.trim() && !createdPersonId);
  const visualScene =
    step === 7
      ? "success"
      : step === 4
        ? "guardian"
        : step === 5 && roles.includes("professor")
          ? "teacher"
          : "people";
  const visualTitle =
    step === 7
      ? "Pessoa pronta para continuar"
      : step === 5
        ? "Defina os vínculos da pessoa"
        : fullName.trim()
          ? `Organizar ${fullName.trim()}`
          : undefined;

  return (
    <AppShell>
      <div className="relative flex min-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft lg:pl-[38%]">
        <aside className="absolute inset-y-0 left-0 hidden w-[38%] overflow-hidden border-r border-border bg-muted/20 lg:block">
          <EducationWorkflowVisual
            scene={visualScene}
            title={visualTitle}
            description={
              step === 5
                ? "Uma pessoa pode assumir mais de um papel. Reutilize a mesma identidade e crie apenas os vínculos necessários."
                : undefined
            }
          />
        </aside>

        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <IconChip icon={UserPlus} tone="primary" size="md" label="Nova pessoa" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold">
                Nova Pessoa — Núcleo de Identidade
              </h1>
              <p className="text-xs text-muted-foreground">
                Passo {step} de 7: Cadastro único universal transparente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (
                hasUnsavedChanges &&
                !window.confirm("Existem alterações não guardadas. Sair sem guardar?")
              ) {
                return;
              }
              goToList();
            }}
            aria-label="Fechar"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-border bg-card px-6 py-2">
          <div className="flex items-center justify-between gap-1 overflow-x-auto text-[11px] font-semibold text-muted-foreground">
            {[
              "Identificação",
              "Contactos",
              "Documentos",
              "Relações",
              "Vínculos",
              "Revisão",
              "Conclusão",
            ].map((label, idx) => {
              const s = idx + 1;
              const active = step === s;
              const done = step > s;
              return (
                <span
                  key={label}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 ${
                    active
                      ? "bg-primary font-bold text-primary-foreground"
                      : done
                        ? "bg-primary/10 font-medium text-primary"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <span>{s}.</span>
                  <span>{label}</span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-secondary/10 p-6">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <IdCard className="size-4 text-primary" />
                  Identificação Pessoal
                </h4>

                <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="wiz_fullname">Nome Completo *</Label>
                    <Input
                      id="wiz_fullname"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex: Manuel Agostinho Neto"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_prefname">Nome Preferencial / Alcunha</Label>
                    <Input
                      id="wiz_prefname"
                      value={preferredName}
                      onChange={(e) => setPreferredName(e.target.value)}
                      placeholder="Ex: Manuel Neto"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_birth">Data de Nascimento</Label>
                    <Input
                      id="wiz_birth"
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_sex">Sexo BI/Cédula</Label>
                    <select
                      id="wiz_sex"
                      value={sex}
                      onChange={(e) => setSex(e.target.value as "M" | "F" | "outro")}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="M">Masculino (M)</option>
                      <option value="F">Feminino (F)</option>
                      <option value="outro">Outro / Não especificado</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_nif">BI ou NIF (Angola)</Label>
                    <AngolaIdentityField
                      id="wiz_nif"
                      value={nifOrBi}
                      onChange={(value) => setNifOrBi(value.toUpperCase())}
                      placeholder="Ex: 000123456LA042"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {duplicateCheck.length > 0 ? (
                <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-warning">
                    <AlertTriangle className="size-4 shrink-0" />
                    Encontrámos correspondências de pessoas já cadastradas:
                  </div>
                  <div className="divide-y divide-border rounded-lg border border-border bg-card">
                    {duplicateCheck.map((dup) => (
                      <div
                        key={dup.id}
                        className="flex items-center justify-between gap-3 p-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold text-foreground">{dup.full_name}</p>
                          <p className="text-muted-foreground">
                            Correspondência por: {dup.match_reason}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="secondary">
                            {Math.round(dup.score * 100)}% Confiança
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-[11px]"
                            onClick={() => goToProfile(dup.id)}
                          >
                            <ExternalLink className="size-3" /> Ver ficha
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se for a mesma pessoa, use "Ver ficha" e adicione o novo vínculo na ficha
                    existente em vez de continuar este cadastro.
                  </p>
                </div>
              ) : null}

              <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
                <h4 className="flex items-center gap-2 text-sm font-bold">
                  <Phone className="size-4 text-primary" />
                  Contactos e Localização
                </h4>

                <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_phone">Telefone Principal (Angola +244)</Label>
                    <AngolaPhoneField
                      id="wiz_phone"
                      value={phonePrimary}
                      onChange={setPhonePrimary}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_phone_alt">Telefone Alternativo / Encarregado</Label>
                    <AngolaPhoneField id="wiz_phone_alt" value={phoneAlt} onChange={setPhoneAlt} />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="wiz_email">Correio Eletrónico (E-mail)</Label>
                    <Input
                      id="wiz_email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemplo@escola.ao"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_province">Província</Label>
                    <select
                      id="wiz_province"
                      value={province}
                      onChange={(e) => {
                        setProvince(e.target.value);
                        setMunicipality("");
                        setCommune("");
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Seleccionar província</option>
                      {angolaProvinces.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_municipality">Município</Label>
                    <Input
                      id="wiz_municipality"
                      value={municipality}
                      onChange={(e) => setMunicipality(e.target.value)}
                      placeholder="Ex.: Huambo"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_commune">Comuna / Localidade</Label>
                    <Input
                      id="wiz_commune"
                      value={commune}
                      onChange={(e) => setCommune(e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_address">Morada detalhada</Label>
                    <Input
                      id="wiz_address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Bairro, rua, casa ou referência"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <FileCheck className="size-4 text-primary" />
                Documento de Identificação Civil Principal
              </h4>

              <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz_doctype">Tipo de Documento</Label>
                  <select
                    id="wiz_doctype"
                    value={docType}
                    onChange={(e) =>
                      setDocType(e.target.value as "bi" | "passaporte" | "cedula" | "outro")
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="bi">Bilhete de Identidade (BI)</option>
                    <option value="cedula">Cédula Pessoal de Nascimento</option>
                    <option value="passaporte">Passaporte</option>
                    <option value="outro">Outro / Identificação Escolar</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="wiz_docnum">Número do Documento</Label>
                  <Input
                    id="wiz_docnum"
                    value={docNumber}
                    onChange={(e) => setDocNumber(e.target.value.toUpperCase())}
                    placeholder="Número do BI ou Cédula"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <Users className="size-4 text-primary" />
                Relações Familiares & Encarregados
              </h4>

              {roles.includes("aluno") ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Procure e associe um encarregado de educação já cadastrado — opcional, pode ser
                    feito depois na ficha da pessoa.
                  </p>

                  {selectedGuardian ? (
                    <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-foreground">
                          {selectedGuardian.full_name}
                        </p>
                        <p className="text-muted-foreground">Será associado como encarregado</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label="Remover encarregado seleccionado"
                        onClick={() => setSelectedGuardian(null)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="wiz_guardian_search"
                          aria-label="Pesquisar encarregado"
                          value={guardianQuery}
                          onChange={(e) => setGuardianQuery(e.target.value)}
                          placeholder="Pesquisar por nome, telefone ou BI…"
                          className="pl-8"
                        />
                        {searchingGuardian ? (
                          <LoaderCircle className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      {guardianResults.length > 0 ? (
                        <div className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                          {guardianResults.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() => {
                                setSelectedGuardian({
                                  id: candidate.id,
                                  full_name: candidate.full_name,
                                });
                                setGuardianQuery("");
                                setGuardianResults([]);
                              }}
                              className="flex w-full items-center justify-between gap-2 p-3 text-left text-xs hover:bg-secondary/50"
                            >
                              <span className="min-w-0 truncate font-medium text-foreground">
                                {candidate.full_name}
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {candidate.phone_primary || candidate.nif || ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : guardianQuery.trim().length >= 2 && !searchingGuardian ? (
                        <p className="px-1 text-[11px] text-muted-foreground">
                          Nenhuma pessoa encontrada com esse nome.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {selectedGuardian ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz_guardian_rel">Tipo de Relação</Label>
                      <select
                        id="wiz_guardian_rel"
                        value={guardianRelationship}
                        onChange={(e) =>
                          setGuardianRelationship(e.target.value as RelationshipType)
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {personRelationshipTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {relationshipLabels[option]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  As relações aplicam-se a pessoas com o papel de Aluno. Assinale esse papel no
                  passo seguinte para associar um encarregado aqui, ou faça-o depois na ficha da
                  pessoa.
                </p>
              )}
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <GraduationCap className="size-4 text-primary" />
                Atribuição de Papéis e Vínculos Iniciais
              </h4>
              <p className="text-xs text-muted-foreground">
                Uma pessoa pode possuir múltiplos vínculos simultâneos. Selecione os papéis
                iniciais:
              </p>

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                {(
                  [
                    { key: "aluno", label: "Aluno (Candidato a Matrícula)" },
                    { key: "encarregado", label: "Encarregado de Educação" },
                    { key: "professor", label: "Professor / Docente" },
                    { key: "funcionario", label: "Funcionário Administrativo" },
                    { key: "coordenador", label: "Coordenador Pedagógico" },
                    { key: "diretor", label: "Diretor Escolar" },
                  ] as const
                ).map((r) => (
                  <label
                    key={r.key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3 text-xs font-medium hover:bg-secondary/40"
                  >
                    <Checkbox
                      checked={roles.includes(r.key)}
                      onCheckedChange={() => handleRoleToggle(r.key)}
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <h4 className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="size-4 text-primary" />
                Revisão dos Dados Antes de Gravar
              </h4>

              <dl className="grid grid-cols-1 gap-4 divide-y divide-border text-xs sm:grid-cols-2 sm:divide-y-0">
                <div>
                  <dt className="text-muted-foreground">Nome Completo</dt>
                  <dd className="mt-0.5 text-sm font-bold">{fullName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Nascimento / Sexo</dt>
                  <dd className="mt-0.5 text-sm font-bold">
                    {birthDate || "—"} ({sex})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Telefone Principal</dt>
                  <dd className="mt-0.5 text-sm font-bold">{phonePrimary || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vínculos Escolhidos</dt>
                  <dd className="mt-0.5 text-sm font-bold">{roles.join(", ") || "Nenhum"}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {step === 7 ? (
            <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/10 p-6 text-center shadow-sm">
              <CheckCircle2 className="mx-auto size-12 text-primary" />
              <div>
                <h4 className="text-lg font-extrabold text-foreground">
                  Pessoa Cadastrada com Sucesso!
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fullName} foi inserida no núcleo de dados do SIGA.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                {roles.includes("aluno") && createdPersonId ? (
                  <Button
                    type="button"
                    onClick={() => goEnroll(createdPersonId)}
                    className="gap-2 shadow-sm"
                  >
                    <GraduationCap className="size-4" />
                    Matricular como Aluno Agora
                  </Button>
                ) : null}
                {createdPersonId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => goToProfile(createdPersonId)}
                    className="gap-2"
                  >
                    <UserCheck className="size-4" />
                    Abrir Perfil 360°
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={goToList}>
                  Concluir
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {step < 7 ? (
          <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={step === 1 || submitting}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Anterior
            </Button>

            {step < 6 ? (
              <Button
                type="button"
                size="sm"
                disabled={checkingDuplicates}
                onClick={step === 1 ? handleNextStep1 : () => setStep((s) => Math.min(6, s + 1))}
                className="gap-1.5"
              >
                Próximo
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={submitting}
                onClick={handleSavePerson}
                className="gap-1.5 shadow-sm"
              >
                {submitting ? "A gravar…" : "Concluir e Criar Pessoa"}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
