import { useMemo, useState, type ReactNode } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { AngolaIdentityField } from "@/components/forms/AngolaIdentityField";
import { AngolaPhoneField } from "@/components/forms/AngolaPhoneField";
import { Textarea } from "@/components/ui/textarea";
import {
  SequentialSheetModal,
  SheetCell,
  SheetGrid,
} from "@/components/modals/SequentialSheetModal";
import { personRelationshipTypeOptions } from "@/features/people/schemas";
import { findPersonDuplicates } from "@/features/people/server";
import { enrollNewStudent } from "@/features/students/server";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";

const steps = [
  { id: "identidade", label: "Identidade", description: "Dados pessoais do aluno." },
  { id: "contactos", label: "Contactos", description: "Telefone, email e morada." },
  { id: "encarregado", label: "Encarregado", description: "Responsável já existente na escola." },
  { id: "turma", label: "Matrícula", description: "Processo e turma do ano lectivo." },
  { id: "revisao", label: "Revisão", description: "Confirme antes de gravar." },
];

const relationshipLabels: Record<string, string> = {
  pai: "Pai",
  mae: "Mãe",
  encarregado: "Encarregado",
  tutor: "Tutor",
  conjuge: "Cônjuge",
  irmao: "Irmão",
  contacto_emergencia: "Contacto de emergência",
  responsavel_financeiro: "Responsável financeiro",
  responsavel_autorizado_buscar: "Autorizado a buscar",
};

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type ClassGroupOption = {
  id: string;
  name: string;
  grade_name: string;
  course_name: string;
  academic_year_id: string;
};

type PersonOption = { id: string; full_name: string; status?: string };

export function StudentEnrollmentSheet({
  trigger,
  autoOpen = false,
  classGroups,
  people,
  onCreated,
}: {
  trigger: (open: () => void) => ReactNode;
  autoOpen?: boolean;
  classGroups: ClassGroupOption[];
  people: PersonOption[];
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(autoOpen);
  const installed = useInstalledIntegrations();
  const resendOn = installed.hasCapability("resend.send");
  const [values, setValues] = useState({
    nome: "",
    nascimento: "",
    genero: "",
    nif: "",
    telefone: "",
    email: "",
    morada: "",
    obs: "",
    processo: "",
    turmaId: "",
    encarregadoId: "",
    parentesco: "encarregado",
  });

  const turmaOptions = useMemo(
    () =>
      classGroups.map((group) => ({
        id: group.id,
        label: `${group.name} · ${group.grade_name} · ${group.course_name}`,
        academicYearId: group.academic_year_id,
      })),
    [classGroups],
  );
  const guardians = useMemo(() => people.filter((row) => row.status !== "inactive"), [people]);

  const setField = (name: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <SequentialSheetModal
        open={open}
        onOpenChange={setOpen}
        eyebrow="Secretaria"
        title="Nova matrícula"
        description="Folha sequencial com todos os dados do aluno antes de gravar na escola."
        icon={<UserPlus className="size-5" />}
        steps={steps}
        submitLabel="Criar matrícula"
        successDescription="Aluno criado. A ficha fica disponível na lista."
        onSubmit={async () => {
          if (values.nome.trim().length < 2) throw new Error("Indique o nome completo.");
          if (!values.processo.trim()) throw new Error("O número de processo é obrigatório.");
          const duplicates = await findPersonDuplicates({
            data: {
              fullName: values.nome,
              birthDate: values.nascimento || undefined,
              phone: values.telefone || undefined,
              email: values.email || undefined,
              nif: values.nif || undefined,
            },
          });
          const strong = duplicates.find((item) => item.score >= 0.9);
          if (strong) {
            throw new Error(
              `Possível duplicado: ${strong.full_name}. Confirme no registo de pessoas antes de criar.`,
            );
          }
          const turma = classGroups.find((group) => group.id === values.turmaId);
          const relationship = values.parentesco || "encarregado";
          await enrollNewStudent({
            data: {
              person: {
                full_name: values.nome,
                birth_date: values.nascimento || undefined,
                sex:
                  values.genero === "F" || values.genero === "M" || values.genero === "outro"
                    ? values.genero
                    : undefined,
                phone_primary: values.telefone || undefined,
                email: values.email || undefined,
                address: values.morada || undefined,
                nif: values.nif || undefined,
                notes: values.obs || undefined,
              },
              registrationNumber: values.processo,
              classGroupId: turma?.id,
              academicYearId: turma?.academic_year_id,
              guardians:
                values.encarregadoId && relationship
                  ? [
                      {
                        guardian_person_id: values.encarregadoId,
                        relationship,
                        is_primary: true,
                        authorized_pickup: true,
                      },
                    ]
                  : [],
              duplicateDecision:
                duplicates.length > 0
                  ? `Matrícula criada após ${duplicates.length} correspondência(s) fraca(s).`
                  : undefined,
            },
          });
          await onCreated();
          setValues({
            nome: "",
            nascimento: "",
            genero: "",
            nif: "",
            telefone: "",
            email: "",
            morada: "",
            obs: "",
            processo: "",
            turmaId: "",
            encarregadoId: "",
            parentesco: "encarregado",
          });
        }}
      >
        {({ stepId }) => {
          if (stepId === "identidade") {
            return (
              <SheetGrid>
                <SheetCell label="Nome completo" full>
                  <Input value={values.nome} onChange={(e) => setField("nome", e.target.value)} />
                </SheetCell>
                <SheetCell label="Data de nascimento">
                  <Input
                    type="date"
                    value={values.nascimento}
                    onChange={(e) => setField("nascimento", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Género">
                  <select
                    className={fieldClass}
                    value={values.genero}
                    onChange={(e) => setField("genero", e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                    <option value="outro">Outro</option>
                  </select>
                </SheetCell>
                <SheetCell label="NIF / BI" full>
                  <AngolaIdentityField
                    id="enroll-nif"
                    value={values.nif}
                    onChange={(next) => setField("nif", next)}
                  />
                </SheetCell>
              </SheetGrid>
            );
          }
          if (stepId === "contactos") {
            return (
              <SheetGrid>
                <SheetCell label="Telefone">
                  <AngolaPhoneField
                    id="enroll-telefone"
                    value={values.telefone}
                    onChange={(next) => setField("telefone", next)}
                  />
                </SheetCell>
                <SheetCell label="Email">
                  <Input
                    type="email"
                    value={values.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                  {resendOn && values.email.trim() ? (
                    <button
                      type="button"
                      className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `Matrícula SIGA — ${values.nome || "novo aluno"}\nContacto: ${values.email}`,
                        );
                        toast.success("Texto copiado para e-mail Resend");
                      }}
                    >
                      Copiar convite Resend
                    </button>
                  ) : null}
                </SheetCell>
                <SheetCell label="Morada" full>
                  <Input
                    value={values.morada}
                    onChange={(e) => setField("morada", e.target.value)}
                  />
                </SheetCell>
                <SheetCell label="Observações" full>
                  <Textarea value={values.obs} onChange={(e) => setField("obs", e.target.value)} />
                </SheetCell>
              </SheetGrid>
            );
          }
          if (stepId === "encarregado") {
            return (
              <SheetGrid>
                <SheetCell label="Encarregado já registado" full>
                  <select
                    className={fieldClass}
                    value={values.encarregadoId}
                    onChange={(e) => setField("encarregadoId", e.target.value)}
                  >
                    <option value="">Sem encarregado nesta matrícula</option>
                    {guardians.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Parentesco" full>
                  <select
                    className={fieldClass}
                    value={values.parentesco}
                    onChange={(e) => setField("parentesco", e.target.value)}
                  >
                    {personRelationshipTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {relationshipLabels[option] ?? option}
                      </option>
                    ))}
                  </select>
                </SheetCell>
              </SheetGrid>
            );
          }
          if (stepId === "turma") {
            return (
              <SheetGrid>
                <SheetCell label="Nº de processo">
                  <Input
                    value={values.processo}
                    onChange={(e) => setField("processo", e.target.value)}
                    placeholder="2026-0001"
                  />
                </SheetCell>
                <SheetCell label="Turma">
                  <select
                    className={fieldClass}
                    value={values.turmaId}
                    onChange={(e) => setField("turmaId", e.target.value)}
                  >
                    <option value="">Sem turma (só processo)</option>
                    {turmaOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </SheetCell>
              </SheetGrid>
            );
          }
          const turmaLabel =
            turmaOptions.find((option) => option.id === values.turmaId)?.label ?? "Sem turma";
          const guardianLabel =
            guardians.find((person) => person.id === values.encarregadoId)?.full_name ?? "—";
          return (
            <div className="grid gap-2 bg-card p-4 text-sm sm:grid-cols-2">
              <p>
                <strong>Aluno:</strong> {values.nome || "—"}
              </p>
              <p>
                <strong>Processo:</strong> {values.processo || "—"}
              </p>
              <p>
                <strong>Turma:</strong> {turmaLabel}
              </p>
              <p>
                <strong>Encarregado:</strong> {guardianLabel}
              </p>
              <p className="sm:col-span-2 text-muted-foreground">
                A secretaria pode completar documentos e relações depois, na ficha do aluno.
              </p>
            </div>
          );
        }}
      </SequentialSheetModal>
    </>
  );
}
