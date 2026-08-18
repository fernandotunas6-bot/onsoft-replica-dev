import { useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import {
  SequentialSheetModal,
  SheetCell,
  SheetGrid,
} from "@/components/modals/SequentialSheetModal";
import { createClassGroup } from "@/features/academic/server";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";

const steps = [
  { id: "identidade", label: "Turma", description: "Nome, código e enquadramento lectivo." },
  { id: "sala", label: "Sala e turno", description: "Capacidade, sala e período do dia." },
  { id: "whatsapp", label: "WhatsApp", description: "Sala da turma no WhatsApp (opcional)." },
  { id: "revisao", label: "Revisão", description: "Confirme antes de gravar." },
];

const fieldClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const shiftLabels = ["Manhã", "Tarde", "Noite"] as const;
const shiftValues = {
  Manhã: "morning",
  Tarde: "afternoon",
  Noite: "evening",
} as const;

export function ClassGroupSheet({
  trigger,
  yearOptions,
  courseOptions,
  gradeOptions,
  roomOptions,
  yearIds,
  courseIds,
  gradeIds,
  roomIds,
  onCreated,
}: {
  trigger: (open: () => void) => ReactNode;
  yearOptions: string[];
  courseOptions: string[];
  gradeOptions: string[];
  roomOptions: string[];
  yearIds: string[];
  courseIds: string[];
  gradeIds: string[];
  roomIds: string[];
  onCreated: () => Promise<void>;
}) {
  const whatsappOn = useInstalledIntegrations().hasCapability("whatsapp.class_groups");
  const visibleSteps = whatsappOn ? steps : steps.filter((step) => step.id !== "whatsapp");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    ano: yearOptions[0] ?? "",
    nome: "",
    codigo: "",
    classe: gradeOptions[0] ?? "",
    curso: courseOptions[0] ?? "",
    sala: "Sem sala",
    turno: "Manhã",
    capacidade: "35",
    whatsappNome: "",
    whatsapp: "",
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const resolveId = (options: string[], selected: string, ids: string[]) => {
    const index = options.indexOf(selected);
    return index >= 0 ? ids[index] : undefined;
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <SequentialSheetModal
        open={open}
        onOpenChange={setOpen}
        eyebrow="Área Pedagógica"
        title="Nova turma"
        description={
          whatsappOn
            ? "Folha sequencial no estilo de grelha — dados, sala e ligação WhatsApp."
            : "Folha sequencial no estilo de grelha — dados e sala. Instale o WhatsApp para ligar o grupo."
        }
        icon={<Users className="size-5" />}
        steps={visibleSteps}
        submitLabel="Criar turma"
        successDescription="Turma guardada na base de dados."
        onSubmit={async () => {
          const academicYearId = resolveId(yearOptions, values.ano, yearIds);
          const courseId = resolveId(courseOptions, values.curso, courseIds);
          const gradeLevelId = resolveId(gradeOptions, values.classe, gradeIds);
          const roomId =
            values.sala === "Sem sala"
              ? undefined
              : resolveId(
                  roomOptions.filter((item) => item !== "Sem sala"),
                  values.sala,
                  roomIds,
                );
          if (!academicYearId || !courseId || !gradeLevelId) {
            throw new Error("Seleccione ano lectivo, curso e classe.");
          }
          const capacity = Number(values.capacidade || 35);
          await createClassGroup({
            data: {
              academicYearId,
              courseId,
              gradeLevelId,
              roomId,
              code: values.codigo,
              name: values.nome,
              shift: shiftValues[values.turno as keyof typeof shiftValues] ?? "morning",
              capacity: Number.isFinite(capacity) ? capacity : 35,
              whatsappInviteUrl: values.whatsapp || undefined,
              whatsappGroupName: values.whatsappNome || undefined,
            },
          });
          await onCreated();
          setValues((current) => ({
            ...current,
            nome: "",
            codigo: "",
            whatsapp: "",
            whatsappNome: "",
          }));
        }}
      >
        {({ stepId }) => (
          <SheetGrid>
            {stepId === "identidade" ? (
              <>
                <SheetCell label="Ano lectivo" full>
                  <select
                    aria-label="Ano lectivo"
                    className={fieldClass}
                    value={values.ano}
                    onChange={(event) => set("ano", event.target.value)}
                  >
                    {yearOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Designação">
                  <input
                    aria-label="Designação"
                    className={fieldClass}
                    value={values.nome}
                    onChange={(event) => set("nome", event.target.value)}
                    placeholder="Ex.: 10ª C"
                  />
                </SheetCell>
                <SheetCell label="Código">
                  <input
                    aria-label="Código"
                    className={fieldClass}
                    value={values.codigo}
                    onChange={(event) => set("codigo", event.target.value)}
                    placeholder="Ex.: 10C"
                  />
                </SheetCell>
                <SheetCell label="Classe">
                  <select
                    aria-label="Classe"
                    className={fieldClass}
                    value={values.classe}
                    onChange={(event) => set("classe", event.target.value)}
                  >
                    {gradeOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Curso">
                  <select
                    aria-label="Curso"
                    className={fieldClass}
                    value={values.curso}
                    onChange={(event) => set("curso", event.target.value)}
                  >
                    {courseOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </SheetCell>
              </>
            ) : null}
            {stepId === "sala" ? (
              <>
                <SheetCell label="Sala">
                  <select
                    aria-label="Sala"
                    className={fieldClass}
                    value={values.sala}
                    onChange={(event) => set("sala", event.target.value)}
                  >
                    {roomOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Turno">
                  <select
                    aria-label="Turno"
                    className={fieldClass}
                    value={values.turno}
                    onChange={(event) => set("turno", event.target.value)}
                  >
                    {shiftLabels.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </SheetCell>
                <SheetCell label="Capacidade" full>
                  <input
                    aria-label="Capacidade"
                    className={fieldClass}
                    type="number"
                    min={1}
                    max={200}
                    value={values.capacidade}
                    onChange={(event) => set("capacidade", event.target.value)}
                  />
                </SheetCell>
              </>
            ) : null}
            {stepId === "whatsapp" ? (
              <>
                <SheetCell label="Nome da sala WhatsApp">
                  <input
                    aria-label="Nome da sala WhatsApp"
                    className={fieldClass}
                    value={values.whatsappNome}
                    onChange={(event) => set("whatsappNome", event.target.value)}
                    placeholder="Turma 10C"
                  />
                </SheetCell>
                <SheetCell label="Link do grupo" full>
                  <input
                    aria-label="Link do grupo WhatsApp"
                    className={fieldClass}
                    value={values.whatsapp}
                    onChange={(event) => set("whatsapp", event.target.value)}
                    placeholder="https://chat.whatsapp.com/…"
                  />
                  {values.whatsapp.trim().startsWith("http") ? (
                    <a
                      href={values.whatsapp.trim()}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                    >
                      Pré-visualizar grupo
                    </a>
                  ) : null}
                </SheetCell>
              </>
            ) : null}
            {stepId === "revisao" ? (
              <SheetCell label="Resumo" full>
                <ul className="space-y-1 text-sm">
                  <li>
                    <strong>{values.nome || "Sem nome"}</strong> · {values.codigo || "sem código"}
                  </li>
                  <li>
                    {values.classe} · {values.curso} · {values.turno}
                  </li>
                  <li>
                    Sala: {values.sala} · Capacidade: {values.capacidade}
                  </li>
                  {whatsappOn ? (
                    <li>WhatsApp: {values.whatsappNome || values.whatsapp || "não ligado"}</li>
                  ) : null}
                </ul>
              </SheetCell>
            ) : null}
          </SheetGrid>
        )}
      </SequentialSheetModal>
    </>
  );
}
