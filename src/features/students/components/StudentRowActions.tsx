import {
  Copy,
  Ellipsis,
  FileText,
  GraduationCap,
  KeyRound,
  Mail,
  Printer,
  Wallet,
  FolderOpen,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportPdfTable } from "@/lib/export-pdf-loader";
import {
  canOpenStudentAccounts,
  canReadStudentSection,
} from "@/features/students/student-sections";
import type { ApplicationRole, ModuleGrantMap } from "@/features/auth/access-policy";

export type StudentQuickAccount = {
  id: string;
  registration_number: string;
  full_name: string;
  email: string | null;
  class_name: string | null;
  grade_name: string | null;
  student_status: string;
};

export function StudentRowActions({
  student,
  role,
  grants,
}: {
  student: StudentQuickAccount;
  role: ApplicationRole;
  grants: ModuleGrantMap;
}) {
  const finance = canReadStudentSection("financeiro", role, grants);
  const academic = canReadStudentSection("academico", role, grants);
  const documents = canReadStudentSection("documentos", role, grants);
  const studentAccounts = canOpenStudentAccounts(role, grants);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${student.registration_number} — ${student.full_name}`);
      toast.success("Número e nome do aluno copiados.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };
  const print = () =>
    exportPdfTable(
      `ficha-aluno-${student.registration_number}`,
      "Resumo do aluno",
      [
        { label: "Número", value: (row: StudentQuickAccount) => row.registration_number },
        { label: "Aluno", value: (row: StudentQuickAccount) => row.full_name },
        { label: "Classe", value: (row: StudentQuickAccount) => row.grade_name ?? "" },
        { label: "Turma", value: (row: StudentQuickAccount) => row.class_name ?? "" },
      ],
      [student],
      "Resumo para consulta. Para documentos oficiais, abra a ficha completa.",
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          title="Mais acções"
          aria-label={`Mais acções para ${student.full_name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem asChild>
          <Link to="/alunos/$studentId" params={{ studentId: student.id }}>
            <FileText className="mr-2 size-4" /> Ver perfil / ficha
          </Link>
        </DropdownMenuItem>
        {finance ? (
          <DropdownMenuItem asChild>
            <Link
              to="/alunos/$studentId"
              params={{ studentId: student.id }}
              search={{ secao: "financeiro" }}
            >
              <Wallet className="mr-2 size-4" /> Propinas e cobranças
            </Link>
          </DropdownMenuItem>
        ) : null}
        {academic ? (
          <DropdownMenuItem asChild>
            <Link
              to="/alunos/$studentId"
              params={{ studentId: student.id }}
              search={{ secao: "academico" }}
            >
              <GraduationCap className="mr-2 size-4" /> Ver notas e avaliações
            </Link>
          </DropdownMenuItem>
        ) : null}
        {documents ? (
          <DropdownMenuItem asChild>
            <Link
              to="/alunos/$studentId"
              params={{ studentId: student.id }}
              search={{ secao: "documentos" }}
            >
              <FolderOpen className="mr-2 size-4" /> Documentos e anexos
            </Link>
          </DropdownMenuItem>
        ) : null}
        {studentAccounts ? (
          <DropdownMenuItem asChild>
            <Link to="/pessoas/acessos-alunos">
              <KeyRound className="mr-2 size-4" /> Recuperar / redefinir senha
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy className="mr-2 size-4" /> Copiar número e nome
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void Promise.resolve(print()).catch(() => toast.error("Falha ao gerar PDF."))
          }
        >
          <Printer className="mr-2 size-4" /> Imprimir resumo PDF
        </DropdownMenuItem>
        {student.email ? (
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = `mailto:${encodeURIComponent(student.email ?? "")}?subject=${encodeURIComponent("Comunicação escolar · SIGA Plus")}`;
            }}
          >
            <Mail className="mr-2 size-4" /> Preparar e-mail
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
