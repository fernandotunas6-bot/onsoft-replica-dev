import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Download, GraduationCap, Plus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  aproveitamentoPorClasse,
  disciplinas,
  horario,
  mediaPorTrimestre,
  notas,
  turmas,
} from "@/lib/modules-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pedagogica")({
  head: () => ({
    meta: [
      { title: "Área Pedagógica · ONSCHOOL" },
      {
        name: "description",
        content:
          "Turmas, disciplinas, lançamento de notas por trimestre e horários semanais da escola num só painel pedagógico.",
      },
      { property: "og:title", content: "Área Pedagógica · ONSCHOOL" },
      {
        property: "og:description",
        content: "Gestão de turmas, disciplinas, notas trimestrais e horários escolares.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PedagogicaPage,
});

const axis = { tick: { fontSize: 12 }, stroke: "var(--muted-foreground)" } as const;

function media(n: { mac: number; npp: number; npt: number }) {
  return (n.mac + n.npp + n.npt) / 3;
}

function PedagogicaPage() {
  const [tab, setTab] = useState("turmas");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Área Pedagógica"
          description="Turmas, disciplinas, notas trimestrais e horários — tudo o que sustenta a vida académica da escola."
          actions={
            <>
              <Button variant="outline" className="gap-2">
                <Download className="size-4" /> Pauta trimestral
              </Button>
              <Button className="gap-2">
                <Plus className="size-4" /> Nova turma
              </Button>
            </>
          }
        />

        <StatGrid
          items={[
            { label: "Turmas activas", value: String(turmas.length), hint: "3 turnos em funcionamento" },
            { label: "Disciplinas", value: String(disciplinas.length), hint: "Corpo docente completo" },
            {
              label: "Média geral",
              value: (turmas.reduce((s, t) => s + t.media, 0) / turmas.length).toFixed(1),
              hint: "Escala 0 – 20 valores",
            },
            { label: "Taxa de aproveitamento", value: "86%", hint: "2º trimestre" },
          ]}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="turmas">Turmas</TabsTrigger>
            <TabsTrigger value="disciplinas">Disciplinas</TabsTrigger>
            <TabsTrigger value="notas">Notas</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
          </TabsList>

          <TabsContent value="turmas" className="mt-5 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {turmas.map((t) => {
                const ocupacao = Math.round((t.alunos / t.capacidade) * 100);
                return (
                  <div key={t.id} className="rounded-xl border border-border bg-card p-5 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-lg font-extrabold tracking-tight">
                          Turma {t.nome}
                        </p>
                        <p className="text-xs text-muted-foreground">{t.curso}</p>
                      </div>
                      <span className={cn(badgeBase, toneClass.primary)}>{t.turno}</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Director de turma</dt>
                        <dd className="font-medium">{t.director}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Sala</dt>
                        <dd className="font-medium">{t.sala}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Média da turma</dt>
                        <dd className="font-medium">{t.media.toFixed(1)} val.</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Alunos</dt>
                        <dd className="font-medium">
                          {t.alunos}/{t.capacidade}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Ocupação</span>
                        <span>{ocupacao}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${ocupacao}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="disciplinas" className="mt-5">
            <Panel title="Disciplinas e docentes" description="Carga horária e taxa de aprovação por disciplina">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Disciplina</TableHead>
                      <TableHead>Professor</TableHead>
                      <TableHead>Classes</TableHead>
                      <TableHead>Carga horária</TableHead>
                      <TableHead className="text-right">Aprovação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {disciplinas.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-semibold">
                          <span className="flex items-center gap-2">
                            <GraduationCap className="size-4 text-primary" />
                            {d.nome}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.professor}</TableCell>
                        <TableCell>{d.classes}</TableCell>
                        <TableCell>{d.cargaHoraria}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              badgeBase,
                              d.aprovacao >= 85
                                ? toneClass.success
                                : d.aprovacao >= 75
                                  ? toneClass.warning
                                  : toneClass.danger,
                            )}
                          >
                            {d.aprovacao}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="notas" className="mt-5 space-y-6">
            <Panel title="Lançamento de notas" description="MAC, NPP e NPT do trimestre corrente">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Disciplina</TableHead>
                      <TableHead className="text-right">MAC</TableHead>
                      <TableHead className="text-right">NPP</TableHead>
                      <TableHead className="text-right">NPT</TableHead>
                      <TableHead className="text-right">Média</TableHead>
                      <TableHead className="text-right">Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notas.map((n) => {
                      const m = media(n);
                      return (
                        <TableRow key={n.id}>
                          <TableCell className="font-semibold">{n.aluno}</TableCell>
                          <TableCell>{n.turma}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{n.disciplina}</TableCell>
                          <TableCell className="text-right">{n.mac}</TableCell>
                          <TableCell className="text-right">{n.npp}</TableCell>
                          <TableCell className="text-right">{n.npt}</TableCell>
                          <TableCell className="text-right font-bold">{m.toFixed(1)}</TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(badgeBase, m >= 10 ? toneClass.success : toneClass.danger)}
                            >
                              {m >= 10 ? "Aprovado" : "Reprovado"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Aproveitamento por classe" description="Percentagem de aprovados">
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aproveitamentoPorClasse}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="classe" {...axis} />
                      <YAxis {...axis} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Bar dataKey="aprovados" fill="var(--chart-1)" radius={[8, 8, 0, 0]} maxBarSize={34} />
                      <Bar dataKey="reprovados" fill="var(--chart-4)" radius={[8, 8, 0, 0]} maxBarSize={34} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Evolução da média" description="Média geral por trimestre">
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mediaPorTrimestre}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="trimestre" {...axis} />
                      <YAxis domain={[10, 20]} {...axis} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="media"
                        stroke="var(--chart-3)"
                        strokeWidth={3}
                        dot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="horarios" className="mt-5">
            <Panel
              title="Horário semanal — Turma 11ª A"
              description="Turno da manhã"
              action={
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-4" /> Ano lectivo 2024/2025
                </span>
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Segunda</TableHead>
                      <TableHead>Terça</TableHead>
                      <TableHead>Quarta</TableHead>
                      <TableHead>Quinta</TableHead>
                      <TableHead>Sexta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {horario.map((h) => (
                      <TableRow key={h.hora}>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {h.hora}
                        </TableCell>
                        <TableCell>{h.seg}</TableCell>
                        <TableCell>{h.ter}</TableCell>
                        <TableCell>{h.qua}</TableCell>
                        <TableCell>{h.qui}</TableCell>
                        <TableCell>{h.sex}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
