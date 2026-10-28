import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { academicStatusLabel } from "./academic-status";
import { searchEnrollmentStudents } from "./enrollment-student-search";
import type { ExistingStudentOption } from "./existing-student-match";

export function EnrollmentEntryDialog({
  open,
  onOpenChange,
  onCreate,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onSelect: (student: ExistingStudentOption) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExistingStudentOption[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setStatus("idle");
      setSearching(false);
    }
  }, [open]);
  useEffect(() => {
    const term = query.trim();
    if (!open || !searching || term.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setResults([]);
    setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const students = await searchEnrollmentStudents({ data: { query: term } });
        if (!cancelled) {
          setResults(students);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, searching, query, retry]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova matrícula</DialogTitle>
          <DialogDescription>
            Escolha uma ficha existente ou cadastre um novo aluno.
          </DialogDescription>
        </DialogHeader>
        {!searching ? (
          <div className="grid gap-3">
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal px-4 py-4 text-left"
              onClick={() => setSearching(true)}
            >
              <Search className="size-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">Procurar aluno existente</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Use o nome, BI/NIF ou número de estudante.
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start gap-3 whitespace-normal px-4 py-4 text-left"
              onClick={onCreate}
            >
              <UserPlus className="size-5 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">Criar novo aluno</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  Para quem ainda não tem ficha nesta escola.
                </span>
              </span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm font-medium">
              <span>Procurar aluno</span>
              <Input
                autoFocus
              aria-label="Procurar aluno"
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, BI/NIF ou número de estudante"
              />
            </label>
            <div aria-live="polite" className="text-sm text-muted-foreground">
              {status === "idle"
                ? "Escreva pelo menos 2 caracteres para pesquisar nesta escola."
                : null}
              {status === "loading" ? "A procurar alunos…" : null}
              {status === "ready" && !results.length
                ? "Nenhum aluno encontrado. Pode criar uma nova ficha."
                : null}
            </div>
            {status === "error" ? (
              <div role="alert" className="space-y-2 text-sm">
                <p>Não foi possível pesquisar. Tente novamente.</p>
                <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
                  Tentar novamente
                </Button>
              </div>
            ) : null}
            {results.length ? (
              <ul
                aria-label="Alunos encontrados"
                className="max-h-64 divide-y overflow-y-auto rounded-lg border"
              >
                {results.map((student) => (
                  <li
                    key={student.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{student.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Nº {student.registration_number || "—"} ·{" "}
                        {academicStatusLabel(student.student_status)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Seleccionar ${student.full_name}`}
                      onClick={() => onSelect(student)}
                    >
                      Seleccionar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
              <Button variant="ghost" onClick={() => setSearching(false)}>
                Voltar
              </Button>
              <Button onClick={onCreate}>
                <UserPlus className="mr-2 size-4" aria-hidden="true" />
                Criar novo aluno
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
