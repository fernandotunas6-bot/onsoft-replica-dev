import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Filter, Plus, Search, UserPlus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { classOptions, statusOptions, students, studentSummary } from "@/lib/students-data";
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

const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

const estadoTone: Record<string, string> = {
  Activo: "bg-success/15 text-success",
  Inactivo: "bg-muted text-muted-foreground",
  Transferido: "bg-info/10 text-info",
};

const pagamentoTone: Record<string, string> = {
  Regularizado: "bg-success/15 text-success",
  Pendente: "bg-warning/20 text-warning-foreground",
  "Em dívida": "bg-destructive/12 text-destructive",
};

function StudentsPage() {
  const [query, setQuery] = useState("");
  const [classe, setClasse] = useState("todas");
  const [estado, setEstado] = useState("todos");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      const matchQuery =
        !q ||
        s.nome.toLowerCase().includes(q) ||
        s.processo.toLowerCase().includes(q) ||
        s.encarregado.toLowerCase().includes(q);
      const matchClass = classe === "todas" || s.classe === classe;
      const matchStatus = estado === "todos" || s.estado === estado;
      return matchQuery && matchClass && matchStatus;
    });
  }, [query, classe, estado]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Secretaria
            </p>
            <h1 className="font-display text-2xl font-extrabold tracking-tight md:text-3xl">
              Gestão de Alunos
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consulte matrículas, situação financeira e desempenho de cada aluno.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Download className="size-4" /> Exportar
            </Button>
            <QuickFormModal
              title="Matricular novo aluno"
              eyebrow="Secretaria"
              description="Preencha os dados do aluno e do encarregado de educação para gerar a matrícula."
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
                  <UserPlus className="size-4" /> Novo aluno
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

        <div className="rounded-xl border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar por nome, processo ou encarregado…"
                className="pl-9"
                aria-label="Pesquisar aluno"
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Filter className="size-4 text-muted-foreground" />
              <select
                value={classe}
                onChange={(e) => setClasse(e.target.value)}
                aria-label="Filtrar por classe"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="todas">Todas as classes</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>
                    {c} Classe
                  </option>
                ))}
              </select>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                aria-label="Filtrar por estado"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="todos">Todos os estados</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Processo</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Classe / Turma</TableHead>
                  <TableHead>Curso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Financeiro</TableHead>
                  <TableHead className="text-right">Média</TableHead>
                  <TableHead className="text-right">Ficha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.processo}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                          {s.nome
                            .split(" ")
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join("")}
                        </span>
                        <div className="leading-tight">
                          <p className="font-semibold">{s.nome}</p>
                          <p className="text-xs text-muted-foreground">{s.encarregado}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.classe} · Turma {s.turma}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.curso}</TableCell>
                    <TableCell>
                      <span className={cn(badge, estadoTone[s.estado])}>{s.estado}</span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(badge, pagamentoTone[s.pagamento])}>{s.pagamento}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {s.mediaFinal.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/alunos/$studentId" params={{ studentId: s.id }}>
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum aluno encontrado com os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground">
            <span>
              A mostrar {filtered.length} de {students.length} alunos
            </span>
            <Button variant="ghost" size="sm" className="gap-1">
              <Plus className="size-3.5" /> Carregar mais
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
