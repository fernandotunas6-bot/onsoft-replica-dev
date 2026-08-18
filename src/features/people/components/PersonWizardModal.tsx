import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck,
  GraduationCap,
  IdCard,
  Mail,
  Phone,
  UserCheck,
  UserPlus,
  Users,
  ShieldCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogExpandButton, useExpandableDialog } from "@/features/arquivos/dialog-expand";
import { createPerson, findPersonDuplicates } from "@/features/people/server";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";

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
  const { expanded, toggleExpanded, contentClassName } = useExpandableDialog();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<Array<{
    id: string;
    full_name: string;
    score: number;
    match_reason: string;
    status: string;
  }>>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  // Form State
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

  const [roles, setRoles] = useState<string[]>(["aluno"]);
  const [createdPersonId, setCreatedPersonId] = useState<string | null>(null);

  const resetForm = () => {
    setStep(1);
    setSubmitting(false);
    setDuplicateCheck([]);
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

  const handleRoleToggle = (roleKey: string) => {
    setRoles((prev) =>
      prev.includes(roleKey) ? prev.filter((r) => r !== roleKey) : [...prev, roleKey],
    );
  };

  const handleSavePerson = async () => {
    setSubmitting(true);
    try {
      const result = await createPerson({
        data: {
          person: {
            full_name: fullName.trim(),
            preferred_name: preferredName.trim() || undefined,
            birth_date: birthDate || undefined,
            sex,
            nif: nifOrBi.trim() || undefined,
            phone_primary: phonePrimary || undefined,
            phone_alternative: phoneAlt || undefined,
            email: email.trim() || undefined,
            address: address.trim() || undefined,
          },
          roles: roles as any,
          documents: docNumber.trim()
            ? [
                {
                  document_type: docType,
                  document_number: docNumber.trim(),
                },
              ]
            : [],
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["people"] });
      setCreatedPersonId(result.id);
      toast.success("Pessoa cadastrada com sucesso no núcleo de identidade!");
      setStep(7);
    } catch (err) {
      toast.error("Não foi possível criar a pessoa.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent
        className={contentClassName(
          "flex max-h-[min(94vh,820px)] w-[min(880px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl",
        )}
      >
        <DialogExpandButton expanded={expanded} onToggle={toggleExpanded} />

        {/* CABEÇALHO DO WIZARD */}
        <div className="border-b border-border bg-card px-6 py-4 pr-20">
          <div className="flex items-center gap-3">
            <UserPlus className="size-6 text-primary" />
            <div>
              <DialogTitle className="text-lg font-bold">
                Nova Pessoa — Núcleo de Identidade
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Passo {step} de 7: Cadastro único universal independente de vínculo escolar.
              </DialogDescription>
            </div>
          </div>

          {/* PROGRESSO EM PASSOS */}
          <div className="mt-4 flex items-center justify-between gap-1 overflow-x-auto text-[11px] font-semibold text-muted-foreground">
            {["Identificação", "Contactos", "Documentos", "Relações", "Vínculos", "Revisão", "Conclusão"].map(
              (label, idx) => {
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
              },
            )}
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
                      onChange={(e) => setSex(e.target.value as any)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="M">Masculino (M)</option>
                      <option value="F">Feminino (F)</option>
                      <option value="outro">Outro / Não especificado</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_nif">BI ou NIF (Angola)</Label>
                    <Input
                      id="wiz_nif"
                      value={nifOrBi}
                      onChange={(e) => setNifOrBi(e.target.value.toUpperCase())}
                      placeholder="Ex: 000123456LA042"
                      maxLength={14}
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
                      <div key={dup.id} className="flex items-center justify-between p-3 text-xs">
                        <div>
                          <p className="font-bold text-foreground">{dup.full_name}</p>
                          <p className="text-muted-foreground">Correspondência por: {dup.match_reason}</p>
                        </div>
                        <Badge variant="secondary">
                          {Math.round(dup.score * 100)}% Confiança
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Se for a mesma pessoa, cancele este cadastro e adicione o novo vínculo na ficha existente.
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
                    <AngolaPhoneField
                      id="wiz_phone_alt"
                      value={phoneAlt}
                      onChange={setPhoneAlt}
                    />
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
                    onChange={(e) => setDocType(e.target.value as any)}
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
              <p className="text-xs text-muted-foreground">
                As relações podem ser adicionadas ou vinculadas a pessoas já cadastradas imediatamente após concluir o registo inicial.
              </p>
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
                Uma pessoa pode possuir múltiplos vínculos simultâneos. Selecione os papéis iniciais:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {[
                  { key: "aluno", label: "Aluno (Candidato a Matrícula)" },
                  { key: "encarregado", label: "Encarregado de Educação" },
                  { key: "professor", label: "Professor / Docente" },
                  { key: "funcionario", label: "Funcionário Administrativo" },
                  { key: "coordenador", label: "Coordenador Pedagógico" },
                  { key: "diretor", label: "Diretor Escolar" },
                ].map((r) => (
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
                  <dd className="font-bold text-sm mt-0.5">{birthDate || "—"} ({sex})</dd>
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
      </DialogContent>
    </Dialog>
  );
}
