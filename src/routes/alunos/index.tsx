import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Input } from "@/components/ui/input";
import { MediaAvatar } from "@/components/ui/media-frame";
import { IconChip } from "@/components/ui/icon-chip";
import { inferIcon } from "@/lib/auto-icon";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  classOptions,
  courseOptions,
  periodOptions,
  roomOptions,
  statusOptions,
  students,
  studentSummary,
  turmaOptions,
} from "@/lib/students-data";
import { schoolYear } from "@/lib/school-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alunos/")({
  head: () => ({
    meta: [
      { title: "Gestão de Alunos · SIGA" },
      {
        name: "description",
        content:
          "Lista de alunos matriculados: pesquisa por nome ou processo, filtros por classe e estado, situação financeira e média final.",
      },
      { property: "og:title", content: "Gestão de Alunos · SIGA" },
      {
        property: "og:description",
        content: "Pesquise, filtre e consulte a ficha completa de cada aluno da escola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentsPage,
});

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground";

const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

const estadoTone: Record<string, string> = {
  Matriculado: "bg-primary text-primary-foreground",
  Inactivo: "bg-muted text-muted-foreground",
  Transferido: "border border-destructive/30 bg-destructive/10 text-destructive",
};

const pagamentoTone: Record<string, string> = {
  Regularizado: "bg-success/15 text-success",
  Pendente: "bg-warning/20 text-warning-foreground",
  "Em dívida": "bg-destructive/12 text-destructive",
};


type SortKey = "processo" | "nome" | "email" | "telefone" | "estado";

function StudentsPage() {
  const [query, setQuery] = useState("");
  const [classe, setClasse] = useState("todas");
  const [estado, setEstado] = useState("todos");
  const [curso, setCurso] = useState("todos");
  const [turma, setTurma] = useState("todas");
  const [periodo, setPeriodo] = useState("todos");
  const [sala, setSala] = useState("todas");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = students.filter((s) => {
      const matchQuery =
        !q ||
        s.nome.toLowerCase().includes(q) ||
        s.processo.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.encarregado.toLowerCase().includes(q);
      const matchClass = classe === "todas" || s.classe === classe;
      const matchStatus = estado === "todos" || s.estado === estado;
      const matchCourse = curso === "todos" || s.curso === curso;
      const matchTurma = turma === "todas" || s.turma === turma;
      return matchQuery && matchClass && matchStatus && matchCourse && matchTurma;
    });

    return [...rows].sort((a, b) => {
      const cmp = String(a[sortKey]).localeCompare(String(b[sortKey]), "pt", {
        numeric: true,
        sensitivity: "base",
      });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [query, classe, estado, curso, turma, sortKey, sortDir]);


  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const sortIcon = (key: SortKey) =>
    key !== sortKey ? (
      <ArrowUpDown className="size-3 opacity-40" />
    ) : sortDir === "asc" ? (
      <ArrowUp className="size-3 text-primary" />
    ) : (
      <ArrowDown className="size-3 text-primary" />
    );

  const SortHead = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => changeSort(colKey)}
        className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-foreground"
      >
        {label}
        {sortIcon(colKey)}
      </button>
    </TableHead>
  );


  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <IconChip {...inferIcon("Gestão de Estudantes")} size="lg" />
            <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">
              Gestão de Estudantes
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerencie matrículas e informações dos estudantes
            </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Download className="size-4" /> Exportar
            </Button>
            <QuickFormModal
              title="Nova matrícula"
              eyebrow="Secretaria"
              description="Preencha os dados do estudante e do encarregado de educação para gerar a matrícula."
              icon={<UserPlus className="size-5" />}
              size="lg"
              submitLabel="Criar matrícula"
              note="A matrícula é criada e fica pendente de confirmação de pagamento."
              fields={[
                { name: "nome", label: "Nome completo", placeholder: "Ex.: Ana Domingos", full: true },
                { name: "nascimento", label: "Data de nascimento", type: "date" },
                { name: "genero", label: "Género", type: "select", options: ["Feminino", "Masculino"] },
                { name: "classe", label: "Classe", type: "select", options: ["7ª", "8ª", "9ª", "10ª", "11ª", "12ª"] },
                { name: "turma", label: "Turma", type: "select", options: ["A", "B", "C"] },
                { name: "encarregado", label: "Encarregado de educação", placeholder: "Nome do encarregado" },
                { name: "telefone", label: "Telefone", placeholder: "+244 9xx xxx xxx" },
                { name: "obs", label: "Observações", type: "textarea", full: true },
              ]}
              trigger={(open) => (
                <Button className="gap-2" onClick={open}>
                  <UserPlus className="size-4" /> Nova Matrícula
                </Button>
              )}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {studentSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border bg-card p-5 shadow-soft"
            >
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder="Pesquisar por nome, email, número…"
                className="pl-9"
                aria-label="Pesquisar aluno"
              />
            </div>

            <span className={selectClass}>{schoolYear}</span>

            <select
              value={curso}
              onChange={(e) => { setCurso(e.target.value); setPage(1); }}
              aria-label="Filtrar por curso"
              className={selectClass}
            >
              <option value="todos">Todos os Cursos</option>
              {courseOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={classe}
              onChange={(e) => { setClasse(e.target.value); setPage(1); }}
              aria-label="Filtrar por classe"
              className={selectClass}
            >
              <option value="todas">Todas as Classes</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c} Classe
                </option>
              ))}
            </select>

            <select
              value={periodo}
              onChange={(e) => { setPeriodo(e.target.value); setPage(1); }}
              aria-label="Filtrar por período"
              className={selectClass}
            >
              <option value="todos">Todos os Períodos</option>
              {periodOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={turma}
              onChange={(e) => { setTurma(e.target.value); setPage(1); }}
              aria-label="Filtrar por turma"
              className={selectClass}
            >
              <option value="todas">Todas as Turmas</option>
              {turmaOptions.map((t) => (
                <option key={t} value={t}>Turma {t}</option>
              ))}
            </select>

            <select
              value={sala}
              onChange={(e) => { setSala(e.target.value); setPage(1); }}
              aria-label="Filtrar por sala"
              className={selectClass}
            >
              <option value="todas">Todas as Salas</option>
              {roomOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <select
              value={estado}
              onChange={(e) => { setEstado(e.target.value); setPage(1); }}
              aria-label="Filtrar por estado"
              className={selectClass}
            >
              <option value="todos">Todos</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <Button variant="outline" size="sm">
              Ano atual
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setClasse("todas");
                setEstado("todos");
                setCurso("todos");
                setTurma("todas");
                setPeriodo("todos");
                setSala("todas");
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>


        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="overflow-x-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <SortHead label="Nº Estudante" colKey="processo" />
                  <SortHead label="Nome" colKey="nome" />
                  <SortHead label="Email" colKey="email" />
                  <SortHead label="Telefone" colKey="telefone" />
                  <TableHead className="hidden xl:table-cell">Ano Lectivo</TableHead>
                  <SortHead label="Estado" colKey="estado" />
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {s.processo}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MediaAvatar
                          alt={s.nome}
                          className="size-9 rounded-xl"
                        />
                        <div className="min-w-0">
                          <p className="whitespace-nowrap font-semibold">{s.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.classe} · Turma {s.turma}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{s.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{s.telefone}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <span className="inline-flex rounded-lg bg-secondary px-2 py-1 font-mono text-[11px] text-secondary-foreground">
                        {schoolYear.replace("Ano Lectivo ", "")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(badge, estadoTone[s.estado])}>{s.estado}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
                          <Link to="/alunos/$studentId" params={{ studentId: s.id }}>
                            <FileText className="size-3.5" /> Ficha
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
                          <Pencil className="size-3.5" /> Editar
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs">
                          <Users className="size-3.5" /> Turma
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum aluno encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
            <span>
              A mostrar {filtered.length === 0 ? 0 : start + 1}–
              {Math.min(start + pageSize, filtered.length)} de {filtered.length} alunos
              {filtered.length !== students.length ? ` (total ${students.length})` : ""}
            </span>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span>Por página</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                  aria-label="Registos por página"
                >
                  {[10, 25, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => Math.abs(p - currentPage) <= 2 || p === 1 || p === totalPages)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && p - (arr[idx - 1] ?? p) > 1 ? (
                        <span className="px-1 opacity-60">…</span>
                      ) : null}
                      <Button
                        variant={p === currentPage ? "default" : "outline"}
                        size="icon"
                        className="size-8 text-xs"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    </span>
                  ))}
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Página seguinte"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </AppShell>
  );
}
