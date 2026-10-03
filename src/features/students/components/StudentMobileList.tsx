import { Eye, FileText, GraduationCap, MessageCircle, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { ActionSheet, type SheetAction } from "@/components/mobile/ActionSheet";
import { EntityAvatar, EntityList, type EntityListItem } from "@/components/mobile/EntityList";
import { EntityListSkeleton } from "@/components/mobile/skeletons";
import { MobileEmptyState, MobileErrorState } from "@/components/mobile/states";
import { StudentStatusBadge } from "@/features/students/components/StudentStatusBadge";
import { MoneyValue } from "@/components/ui/money-value";

/**
 * Lista de alunos no telemóvel (§19).
 *
 * A tabela de computador tem nove colunas: nº de estudante, nome, encarregado,
 * email, telefone, ano lectivo, estado e duas de acções. A 360px isso é uma
 * tabela com scroll horizontal onde não se lê um nome inteiro.
 *
 * Aqui cada aluno é uma linha com o que decide uma acção — quem é, em que turma
 * está, quanto deve, em que estado está. O resto (email, encarregado, ano) está
 * na ficha, a um toque. Não se esconde informação: muda-se o momento em que ela
 * aparece.
 */
export type StudentMobileRow = {
  id: string;
  registration_number: string;
  full_name: string;
  photo_url: string | null;
  student_status: string;
  payment_status: string | null;
  grade_name: string | null;
  class_name: string | null;
  phone: string | null;
  debt_amount?: number;
  overdue_count?: number;
};

export function StudentMobileList({
  students,
  loading,
  error,
  onRetry,
  onOpenStudent,
  onClearFilters,
  emptyTitle = "Nenhum aluno encontrado",
  emptyDescription = "Experimente alterar os filtros ou limpar os critérios.",
  selectedIds,
  onToggleSelect,
  whatsappEnabled = false,
  whatsappHref,
}: {
  students: StudentMobileRow[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onOpenStudent: (student: StudentMobileRow) => void;
  onClearFilters?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  whatsappEnabled?: boolean;
  whatsappHref?: (phone: string) => string;
}) {
  const navigate = useNavigate();
  const [actionsFor, setActionsFor] = useState<StudentMobileRow | null>(null);

  if (loading) return <EntityListSkeleton rows={7} />;
  if (error) return <MobileErrorState what="os alunos" error={error} onRetry={onRetry} />;
  if (!students.length) {
    return (
      <MobileEmptyState
        icon={GraduationCap}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={onClearFilters ? "Limpar filtros" : undefined}
        onAction={onClearFilters}
      />
    );
  }

  const items: EntityListItem[] = students.map((student) => ({
    id: student.id,
    title: student.full_name,
    subtitle: (
      <>
        <span className="tnum">{student.registration_number}</span>
        {student.grade_name ? ` · ${student.grade_name}` : ""}
        {student.class_name ? ` · Turma ${student.class_name}` : ""}
      </>
    ),
    // A dívida é o número que faz alguém agir nesta lista — por isso é a única
    // que sobe à linha de meta, e só quando existe.
    meta:
      student.debt_amount && student.debt_amount > 0 ? (
        <span className="text-destructive-strong">
          <MoneyValue amount={student.debt_amount} tone="negative" size="sm" /> em dívida
          {student.overdue_count ? ` · ${student.overdue_count} fatura(s)` : ""}
        </span>
      ) : undefined,
    status: <StudentStatusBadge status={student.student_status} size="sm" />,
    leading: <EntityAvatar name={student.full_name} photoUrl={student.photo_url} />,
    onSelect: () => onOpenStudent(student),
    onActions: () => setActionsFor(student),
    selected: selectedIds?.includes(student.id),
  }));

  const actions: SheetAction[] = actionsFor
    ? [
        {
          label: "Ver resumo",
          icon: Eye,
          hint: "Painel rápido com estado, turma e finanças",
          onSelect: () => onOpenStudent(actionsFor),
        },
        {
          label: "Abrir ficha completa",
          icon: FileText,
          onSelect: () =>
            void navigate({ to: "/alunos/$studentId", params: { studentId: actionsFor.id } }),
        },
        {
          label: "Ver turma",
          icon: Users,
          hidden: !actionsFor.class_name,
          onSelect: () => void navigate({ to: "/pedagogica", search: { tab: "turmas" } }),
        },
        {
          label: "Mensagem por WhatsApp",
          icon: MessageCircle,
          hidden: !whatsappEnabled || !actionsFor.phone || !whatsappHref,
          onSelect: () => {
            if (!actionsFor.phone || !whatsappHref) return;
            window.open(whatsappHref(actionsFor.phone), "_blank", "noreferrer");
          },
        },
      ]
    : [];

  return (
    <>
      <EntityList
        items={items}
        selectable={Boolean(onToggleSelect)}
        onToggleSelect={onToggleSelect}
      />
      <ActionSheet
        open={Boolean(actionsFor)}
        onOpenChange={(open) => {
          if (!open) setActionsFor(null);
        }}
        title={actionsFor?.full_name ?? ""}
        description={
          actionsFor
            ? [
                actionsFor.grade_name,
                actionsFor.class_name ? `Turma ${actionsFor.class_name}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={actions}
      />
    </>
  );
}
