import { Copy, Download, FileText, GraduationCap, Layers3, Mail, ReceiptText } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { issueTuitionBatch } from "@/features/finance/server";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv } from "@/lib/export-csv";
import { exportPdfTable } from "@/lib/export-pdf-loader";

export type SelectedStudent = {
  id: string;
  registration_number: string;
  full_name: string;
  grade_name: string | null;
  class_name: string | null;
  email: string | null;
  payment_status: string | null;
  debt_amount?: number;
};

const selectedColumns = [
  { label: "Número", value: (row: SelectedStudent) => row.registration_number },
  { label: "Nome", value: (row: SelectedStudent) => row.full_name },
  { label: "Classe", value: (row: SelectedStudent) => row.grade_name ?? "" },
  { label: "Turma", value: (row: SelectedStudent) => row.class_name ?? "" },
];

export function StudentBulkTools({
  students,
  canUseFinance,
  canUseGrades,
}: {
  students: SelectedStudent[];
  canUseFinance: boolean;
  canUseGrades: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const byClass = [...students].sort((a, b) => {
    const left = `${a.grade_name ?? ""} ${a.class_name ?? ""} ${a.full_name}`;
    const right = `${b.grade_name ?? ""} ${b.class_name ?? ""} ${b.full_name}`;
    return left.localeCompare(right, "pt", { sensitivity: "base", numeric: true });
  });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        students.map((s) => `${s.registration_number}\t${s.full_name}`).join("\n"),
      );
      toast.success(`${students.length} aluno(s) copiados.`);
    } catch {
      toast.error("Não foi possível copiar a selecção.");
    }
  };
  const email = () => {
    const addresses = [
      ...new Set(students.map((s) => s.email).filter((e): e is string => Boolean(e))),
    ];
    if (!addresses.length) {
      toast.warning("Os alunos seleccionados não possuem e-mails registados.");
      return;
    }
    if (addresses.length > 20) {
      toast.warning("Seleccione no máximo 20 endereços por e-mail. Use lotes menores.");
      return;
    }
    // Não expor a lista de menores uns aos outros: nunca usar TO/CC.
    window.location.href = `mailto:?bcc=${encodeURIComponent(addresses.join(","))}&subject=${encodeURIComponent("Comunicação da escola")}`;
  };
  const openGrades = () => {
    toast.message("Lance as notas por turma, disciplina e trimestre no módulo Pedagógico.", {
      description: "Esta selecção não é transmitida automaticamente ao livro de notas.",
    });
    void navigate({ to: "/pedagogica", search: { tab: "notas" } });
  };
  const exportDebt = () => {
    const debtors = students.filter(
      (s) => s.payment_status === "overdue" || Number(s.debt_amount ?? 0) > 0,
    );
    if (!debtors.length) {
      toast.message("Nenhuma dívida identificada nesta selecção.");
      return;
    }
    exportCsv(
      "alunos-seleccionados-cobranca",
      [
        ...selectedColumns,
        { label: "Dívida (Kz)", value: (s: SelectedStudent) => Number(s.debt_amount ?? 0) },
        { label: "Estado", value: (s: SelectedStudent) => s.payment_status ?? "" },
      ],
      debtors,
    );
    toast.message(
      "Lista de cobrança preparada. Confirme as faturas no Financeiro antes de cobrar.",
    );
  };

  const issueSelectedTuition = async (values: Record<string, string>) => {
    if (students.length > 60) {
      throw new Error("Seleccione no máximo 60 alunos por lote de propinas.");
    }
    const result = await issueTuitionBatch({
      data: {
        studentIds: students.map((student) => student.id),
        dueOn: values["vencimento"] ?? "",
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
      queryClient.invalidateQueries({ queryKey: ["students", "search"] }),
    ]);
    if (result.issued.length) toast.success(`${result.issued.length} propinas emitidas.`);
    if (result.skipped.length) {
      toast.message(`${result.skipped.length} alunos já tinham propina do mês.`);
    }
    if (result.failed.length) {
      toast.warning(`${result.failed.length} emissão(ões) falharam.`, {
        description: result.failed
          .slice(0, 3)
          .map((entry) => entry.reason)
          .join(" · "),
      });
    }
  };

  const exportSelected = () => exportCsv("alunos-seleccionados", selectedColumns, students);
  const exportGrouped = () => exportCsv("alunos-agrupados-por-turma", selectedColumns, byClass);
  const printSelected = () => {
    void Promise.resolve(
      exportPdfTable(
        "alunos-seleccionados",
        "Lista de alunos seleccionados",
        selectedColumns,
        students,
      ),
    ).catch(() => toast.error("Não foi possível gerar o PDF."));
  };

  if (!students.length) return null;
  return (
    <>
      {canUseFinance ? (
        <QuickFormModal
          eyebrow="Tesouraria"
          title={`Emitir propinas a ${students.length} alunos`}
          description="Emite facturas apenas aos alunos seleccionados, com matrícula activa nesta escola e ano lectivo. Valores e bolsas vêm do plano financeiro. Facturas já emitidas para o mês são ignoradas. Esta operação não regista pagamentos."
          submitLabel={`Emitir propinas (${students.length})`}
          successDescription="Lote processado. Confirme os resultados em Faturas e Recibos."
          fields={[
            {
              name: "vencimento",
              label: "Data de vencimento das propinas",
              type: "date",
              required: true,
            },
          ]}
          onSubmit={issueSelectedTuition}
          trigger={(open) => (
            <Button
              type="button"
              size="sm"
              disabled={students.length > 60}
              onClick={open}
              title={
                students.length > 60
                  ? "Limite: 60 alunos por emissão"
                  : "Emitir faturas de propinas"
              }
            >
              <ReceiptText className="mr-1 size-4" />
              Emitir propinas
            </Button>
          )}
        />
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1 text-xs">
            Escolher acção
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuItem onSelect={() => void copy()}>
            <Copy className="mr-2 size-4" /> Copiar números e nomes
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportSelected}>
            <Download className="mr-2 size-4" /> Exportar seleccionados (CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportGrouped}>
            <Layers3 className="mr-2 size-4" /> Agrupar por turma (lista CSV)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={printSelected}>
            <FileText className="mr-2 size-4" /> Imprimir seleccionados (PDF)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={email}>
            <Mail className="mr-2 size-4" /> Preparar mensagem por e-mail (BCC)
          </DropdownMenuItem>
          {canUseFinance ? (
            <DropdownMenuItem onSelect={exportDebt}>
              <ReceiptText className="mr-2 size-4" /> Preparar lista de cobrança
            </DropdownMenuItem>
          ) : null}
          {canUseGrades ? (
            <DropdownMenuItem onSelect={openGrades}>
              <GraduationCap className="mr-2 size-4" /> Abrir lançamento de notas
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
