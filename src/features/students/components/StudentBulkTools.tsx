import { Copy, Download, FileText, GraduationCap, Layers3, Mail, ReceiptText } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

export function StudentBulkTools({ students }: { students: SelectedStudent[] }) {
  const navigate = useNavigate();
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
    const addresses = [...new Set(students.map((s) => s.email).filter((e): e is string => Boolean(e)))];
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
    toast.message("Lista de cobrança preparada. Confirme as faturas no Financeiro antes de cobrar.");
  };

  if (!students.length) return null;
  return (
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
        <DropdownMenuItem onSelect={() => exportCsv("alunos-seleccionados", selectedColumns, students)}>
          <Download className="mr-2 size-4" /> Exportar seleccionados (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportCsv("alunos-agrupados-por-turma", selectedColumns, byClass)}>
          <Layers3 className="mr-2 size-4" /> Agrupar por turma (lista CSV)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void Promise.resolve(exportPdfTable(
          "alunos-seleccionados",
          "Lista de alunos seleccionados",
          selectedColumns,
          students,
        )).catch(() => toast.error("Não foi possível gerar o PDF."))}>
          <FileText className="mr-2 size-4" /> Imprimir seleccionados (PDF)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={email}>
          <Mail className="mr-2 size-4" /> Preparar mensagem por e-mail (BCC)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportDebt}>
          <ReceiptText className="mr-2 size-4" /> Preparar lista de cobrança
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openGrades}>
          <GraduationCap className="mr-2 size-4" /> Abrir lançamento de notas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
