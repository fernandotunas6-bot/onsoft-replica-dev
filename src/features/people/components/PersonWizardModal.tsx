import { useEffect, useState } from "react";
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
  Loader2,
  Phone,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ModalShell, ModalHeader } from "@/components/ui/modal-system";
import { createPerson, findPersonDuplicates, searchPeople } from "@/features/people/server";
import { personRelationshipTypeOptions, personRoleOptions } from "@/features/people/schemas";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";

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

export function PersonWizardModal({
  open,
  onOpenChange,
  onPersonCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPersonCreated?: (personId: string, action?: "enroll" | "view" | "close") => void;
}) {
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

  const resetForm = () => {
    setStep(1);
    setFullName("");
    setPreferredName("");
    setBirthDate("");
    setSex("M");
    setNifOrBi("");
    setPhonePrimary("");
    setPhoneAlt("");
    setEmail("");
    setAddress("");
    setDocType("bi");
    setDocNumber("");
    setRoles(["aluno"]);
    setCreatedPersonId(null);
    setDuplicateCheck([]);
    setGuardianQuery("");
    setGuardianResults([]);
    setSelectedGuardian(null);
    setGuardianRelationship("encarregado");
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

  return (
    <ModalShell
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
      size="xl"
      hasUnsavedChanges={hasUnsavedChanges}
    >
      <div className="flex flex-col h-full">
        <ModalHeader
          icon={UserPlus}
          title="Nova Pessoa — Núcleo de Identidade"
          subtitle={`Passo ${step} de 7: Cadastro único universal transparente.`}
          onClose={() => {
            if (
              hasUnsavedChanges &&
              !window.confirm("Existem alterações não guardadas. Fechar sem guardar?")
            ) {
              return;
            }
            resetForm();
            onOpenChange(false);
          }}
        />

        <div className="border-b border-border bg-card px-6 py-2">
          {/* PROGRESSO EM PASSOS */}
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
                  className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-full ${
                    active
                      ? "bg-primary text-primary-foreground font-bold"
                      : done
                        ? "bg-primary/10 text-primary font-medium"
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

        {/* CORPO DO WIZARD */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 bg-secondary/10 space-y-4">
          {/* PASSO 1: IDENTIFICAÇÃO */}
          {step === 1 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <IdCard className="size-4 text-primary" />
                  Identificação Pessoal
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="sm:col-span-2 space-y-1.5">
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

          {/* PASSO 2: CONTACTOS */}
          {step === 2 ? (
            <div className="space-y-4">
              {/* ALERTA DE DUPLICADOS */}
              {duplicateCheck.length > 0 ? (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-warning font-bold text-sm">
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
                            onClick={() => {
                              onOpenChange(false);
                              resetForm();
                              onPersonCreated?.(dup.id, "view");
                            }}
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

              <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <Phone className="size-4 text-primary" />
                  Contactos e Localização
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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

                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="wiz_email">Correio Eletrónico (E-mail)</Label>
                    <Input
                      id="wiz_email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemplo@escola.ao"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="wiz_address">Endereço de Residência / Município</Label>
                    <Input
                      id="wiz_address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Bairro, Rua, Casa, Município"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* PASSO 3: DOCUMENTOS */}
          {step === 3 ? (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <FileCheck className="size-4 text-primary" />
                Documento de Identificação Civil Principal
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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

          {/* PASSO 4: RELAÇÕES */}
          {step === 4 ? (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold flex items-center gap-2">
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
                          value={guardianQuery}
                          onChange={(e) => setGuardianQuery(e.target.value)}
                          placeholder="Pesquisar por nome, telefone ou BI…"
                          className="pl-8"
                        />
                        {searchingGuardian ? (
                          <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
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

          {/* PASSO 5: ATRIBUIÇÃO DE VÍNCULOS */}
          {step === 5 ? (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <GraduationCap className="size-4 text-primary" />
                Atribuição de Papéis e Vínculos Iniciais
              </h4>
              <p className="text-xs text-muted-foreground">
                Uma pessoa pode possuir múltiplos vínculos simultâneos. Selecione os papéis
                iniciais:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
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
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/20 hover:bg-secondary/40 cursor-pointer text-xs font-medium"
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

          {/* PASSO 6: REVISÃO INTELIGENTE */}
          {step === 6 ? (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                Revisão dos Dados Antes de Gravar
              </h4>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs divide-y divide-border sm:divide-y-0">
                <div>
                  <dt className="text-muted-foreground">Nome Completo</dt>
                  <dd className="font-bold text-sm mt-0.5">{fullName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Nascimento / Sexo</dt>
                  <dd className="font-bold text-sm mt-0.5">
                    {birthDate || "—"} ({sex})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Telefone Principal</dt>
                  <dd className="font-bold text-sm mt-0.5">{phonePrimary || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Vínculos Escolhidos</dt>
                  <dd className="font-bold text-sm mt-0.5">{roles.join(", ") || "Nenhum"}</dd>
                </div>
              </dl>
            </div>
          ) : null}

          {/* PASSO 7: CONCLUSÃO E AÇÕES RÁPIDAS */}
          {step === 7 ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-6 text-center space-y-4 shadow-sm">
              <CheckCircle2 className="size-12 text-primary mx-auto" />
              <div>
                <h4 className="text-lg font-extrabold text-foreground">
                  Pessoa Cadastrada com Sucesso!
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {fullName} foi inserida no núcleo de dados do SIGA.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                {roles.includes("aluno") && createdPersonId ? (
                  <Button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onPersonCreated?.(createdPersonId, "enroll");
                    }}
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
                    onClick={() => {
                      onOpenChange(false);
                      onPersonCreated?.(createdPersonId, "view");
                    }}
                    className="gap-2"
                  >
                    <UserCheck className="size-4" />
                    Abrir Perfil 360°
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onOpenChange(false);
                    resetForm();
                  }}
                >
                  Concluir
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* RODAPÉ E NAVEGAÇÃO DO WIZARD */}
        {step < 7 ? (
          <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-between">
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
    </ModalShell>
  );
}
