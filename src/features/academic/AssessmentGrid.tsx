import { useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { badgeBase, toneClass } from "@/components/layout/PageHeader";
import { initialsFromName, parsePautaScore } from "@/lib/angola-academic";
import { cn } from "@/lib/utils";

export type GridColumn = {
  key: string;
  label: string;
  editable?: boolean;
  width?: string;
  title?: string;
};

export type GridStudent = {
  id: string;
  student_name: string;
  student_photo_url?: string | null;
  registration_number?: string | null;
};

export function AssessmentGrid({
  students,
  columns,
  values,
  dirtyKeys,
  selectedId,
  checkedIds,
  readOnly,
  onChange,
  onSelect,
  onToggle,
  onToggleAll,
  onCommitMove,
}: {
  students: GridStudent[];
  columns: GridColumn[];
  values: Record<string, Record<string, string>>;
  dirtyKeys: Set<string>;
  selectedId: string | null;
  checkedIds?: Set<string>;
  readOnly: boolean;
  onChange: (enrollmentId: string, key: string, value: string) => void;
  onSelect: (enrollmentId: string) => void;
  onToggle?: (enrollmentId: string, shiftKey: boolean) => void;
  onToggleAll?: () => void;
  onCommitMove: (row: number, col: number, direction: "down" | "up" | "left" | "right") => void;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  const editable = useMemo(
    () =>
      columns.map((column, index) => ({ column, index })).filter((item) => item.column.editable),
    [columns],
  );

  const focusCell = useCallback((row: number, col: number) => {
    const input = tableRef.current?.querySelector<HTMLInputElement>(`[data-grid="${row}-${col}"]`);
    input?.focus();
    input?.select();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommitMove(row, col, event.shiftKey ? "up" : "down");
      focusCell(event.shiftKey ? Math.max(0, row - 1) : row + 1, col);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const delta = event.shiftKey ? -1 : 1;
      const next =
        editable.find((item) => item.index === col + delta) ??
        editable[delta > 0 ? 0 : editable.length - 1];
      if (next) {
        const nextRow = next.index === col + delta ? row : delta > 0 ? row + 1 : row - 1;
        focusCell(Math.max(0, nextRow), next.index);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(row + 1, col);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(Math.max(0, row - 1), col);
    }
    if (
      event.key === "ArrowRight" &&
      event.currentTarget.selectionStart === event.currentTarget.value.length
    ) {
      const next = editable.find((item) => item.index > col);
      if (next) {
        event.preventDefault();
        focusCell(row, next.index);
      }
    }
    if (event.key === "ArrowLeft" && event.currentTarget.selectionStart === 0) {
      const prev = [...editable].reverse().find((item) => item.index < col);
      if (prev) {
        event.preventDefault();
        focusCell(row, prev.index);
      }
    }
  };

  return (
    <div className="overflow-auto rounded-lg border border-border">
      <table ref={tableRef} className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
          <tr>
            {onToggle ? (
              <th className="w-8 border-b px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={
                    students.length > 0 && students.every((student) => checkedIds?.has(student.id))
                  }
                  onChange={() => onToggleAll?.()}
                />
              </th>
            ) : null}
            <th className="w-10 border-b px-2 py-2 text-left text-[11px] font-bold text-muted-foreground">
              Nº
            </th>
            <th className="border-b px-2 py-2 text-left text-[11px] font-bold text-muted-foreground">
              Aluno
            </th>
            <th className="w-24 border-b px-2 py-2 text-left text-[11px] font-bold text-muted-foreground">
              Proc.
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                title={column.title}
                className={cn(
                  "border-b px-2 py-2 text-right text-[11px] font-bold text-muted-foreground",
                  column.width,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student, row) => {
            const rowValues = values[student.id] ?? {};
            return (
              <tr
                key={student.id}
                onClick={() => onSelect(student.id)}
                className={cn(
                  "cursor-pointer hover:bg-muted/40",
                  selectedId === student.id && "bg-primary/8",
                  checkedIds?.has(student.id) && "bg-primary/5",
                )}
              >
                {onToggle ? (
                  <td className="border-b px-2 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${student.student_name}`}
                      checked={checkedIds?.has(student.id) ?? false}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggle(student.id, event.shiftKey);
                      }}
                      onChange={() => undefined}
                    />
                  </td>
                ) : null}
                <td className="border-b px-2 py-1.5 text-xs text-muted-foreground">
                  {String(row + 1).padStart(2, "0")}
                </td>
                <td className="border-b px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      {...(student.student_photo_url ? { url: student.student_photo_url } : {})}
                      initials={initialsFromName(student.student_name)}
                      className="size-8 bg-primary-soft text-[11px] font-extrabold text-primary"
                    />
                    <span className="font-semibold">{student.student_name}</span>
                  </div>
                </td>
                <td className="border-b px-2 py-1.5 text-xs text-muted-foreground">
                  {student.registration_number ?? "—"}
                </td>
                {columns.map((column, col) => {
                  const value = rowValues[column.key] ?? "";
                  const cellKey = `${student.id}:${column.key}`;
                  const parsed = column.editable ? parsePautaScore(value) : null;
                  const invalid = column.editable && value.trim() !== "" && Number.isNaN(parsed);
                  if (column.key === "situacao") {
                    const tone =
                      value === "Transita" || value === "Aprovado"
                        ? toneClass.success
                        : value === "Não transita" || value === "Reprovado"
                          ? toneClass.danger
                          : toneClass.muted;
                    return (
                      <td key={column.key} className="border-b px-2 py-1.5 text-right">
                        <span className={cn(badgeBase, tone)}>{value || "Pendente"}</span>
                      </td>
                    );
                  }
                  if (!column.editable || readOnly) {
                    return (
                      <td key={column.key} className="border-b px-2 py-1.5 text-right font-medium">
                        {value || "—"}
                      </td>
                    );
                  }
                  return (
                    <td key={column.key} className="border-b p-0">
                      <input
                        data-grid={`${row}-${col}`}
                        aria-label={`${column.label} de ${student.student_name}`}
                        inputMode="decimal"
                        value={value}
                        readOnly={readOnly}
                        onChange={(event) => onChange(student.id, column.key, event.target.value)}
                        onKeyDown={(event) => onKeyDown(event, row, col)}
                        className={cn(
                          "h-9 w-full bg-transparent px-2 text-right outline-none focus:bg-primary/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          dirtyKeys.has(cellKey) && "bg-warning/20",
                          invalid && "bg-destructive/15 text-destructive",
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
