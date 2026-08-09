import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Mail, MapPin, Phone, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { getStudent } from "@/lib/students-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alunos/$studentId")({
  head: () => ({
    meta: [
      { title: "Ficha do Aluno · SIGA" },
      {
        name: "description",
        content:
          "Ficha completa do aluno: dados pessoais, encarregado de educação, matrícula, presença, média final e situação financeira.",
      },
      { property: "og:title", content: "Ficha do Aluno · SIGA" },
      {
        property: "og:description",
        content: "Dados pessoais, matrícula, desempenho académico e situação financeira do aluno.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentDetail,
  notFoundComponent: () => (
    <AppShell>
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-soft">
        <h1 className="font-display text-xl font-bold">Aluno não encontrado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O processo indicado não existe ou foi removido.
        </p>
        <Button asChild className="mt-6">
          <Link to="/alunos">Voltar à lista</Link>
        </Button>
      </div>
    </AppShell>
  ),
  errorComponent: () => (
    <AppShell>
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-soft">
        <h1 className="font-display text-xl font-bold">Não foi possível carregar a ficha</h1>
        <Button asChild className="mt-6">
          <Link to="/alunos">Voltar à lista</Link>
        </Button>
      </div>
    </AppShell>
  ),
});

const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function StudentDetail() {
  const { studentId } = Route.useParams();
  const student = getStudent(studentId);
  if (!student) throw notFound();

  const initials = student.nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    <AppShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2">
          <Link to="/alunos">
            <ArrowLeft className="size-4" /> Gestão de Alunos
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-6 shadow-soft">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft font-display text-xl font-extrabold text-primary">
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">{student.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {student.processo} · {student.classe} Classe · Turma {student.turma}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn(badge, "bg-success/15 text-success")}>{student.estado}</span>
              <span className={cn(badge, "bg-primary-soft text-primary")}>{student.curso}</span>
              <span className={cn(badge, "bg-warning/20 text-warning-foreground")}>
                {student.pagamento}
              </span>
            </div>
          </div>
          <Button className="ml-auto gap-2">
            <Pencil className="size-4" /> Editar ficha
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Média final", value: student.mediaFinal.toFixed(1), hint: "Escala 0-20" },
            { label: "Taxa de presença", value: `${student.presenca}%`, hint: "Ano lectivo actual" },
            {
              label: "Matriculado em",
              value: new Date(student.matriculadoEm).toLocaleDateString("pt-PT"),
              hint: "Data de confirmação",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-base font-bold">Dados pessoais</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" value={student.nome} />
              <Field label="Género" value={student.genero} />
              <Field
                label="Data de nascimento"
                value={new Date(student.dataNascimento).toLocaleDateString("pt-PT")}
              />
              <Field label="Nº de processo" value={student.processo} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-base font-bold">Encarregado de educação</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Field label="Nome" value={student.encarregado} />
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4" /> {student.telefone}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4" /> {student.email}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" /> {student.morada}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <h2 className="font-display text-base font-bold">Matrícula e situação</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Curso" value={student.curso} />
              <Field label="Classe" value={`${student.classe} Classe`} />
              <Field label="Turma" value={student.turma} />
              <Field label="Situação financeira" value={student.pagamento} />
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-4" /> Dados de demonstração — serão ligados ao backend na
              próxima fase.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
