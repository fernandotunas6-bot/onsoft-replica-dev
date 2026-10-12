import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  READINESS_ITEM_LIMIT,
  type MobileReadiness,
  type ReadinessCheck,
  type ReadinessLink,
} from "./mobile-readiness";
import { cn } from "@/lib/utils";

/** Conteúdo de /configuracoes/mobile: contagens e cada verificação com atalho. */
export function ReadinessContent({ readiness }: { readiness: MobileReadiness }) {
  const groups = ["Alunos", "Professores", "Turmas"] as const;
  if (!readiness.activeYears.length)
    return (
      <Panel title="Sem ano lectivo activo">
        <p className="text-sm text-muted-foreground">
          O Mobile mostra só o ano lectivo activo. Active um ano lectivo em Definições para
          verificar a prontidão.
        </p>
      </Panel>
    );
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Quem já usa o Mobile">
        <Tally label="Alunos prontos" {...readiness.students} />
        <Tally label="Professores prontos" {...readiness.teachers} />
      </section>
      <p className="text-xs text-muted-foreground">
        Ano lectivo activo: {readiness.activeYears.join(", ")}. Pronto quer dizer: conta ligada à
        ficha, papel certo na escola e disciplinas atribuídas.
      </p>
      {groups.map((group) => {
        const checks = readiness.checks.filter((c) => c.group === group);
        return (
          <Panel key={group} title={group}>
            <ol className="divide-y">
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </ol>
          </Panel>
        );
      })}
    </>
  );
}

function Tally({ label, ready, total }: { label: string; ready: number; total: number }) {
  const percent = total ? Math.round((ready / total) * 100) : 0;
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {ready} <span className="text-base font-normal text-muted-foreground">de {total}</span>
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  const done = check.count === 0;
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
      <span className="mt-0.5 shrink-0" aria-hidden>
        {done ? (
          <CheckCircle2 className="size-5 text-success-strong" />
        ) : (
          <CircleAlert className="size-5 text-warning-strong" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {check.title}
          <span className={cn("ml-2 tabular-nums", done ? "text-success-strong" : "")}>
            {check.count}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{check.description}</p>
        {check.items.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {check.items.map((item) => (
              <li key={item.id}>
                <ReadinessAnchor
                  link={item.link}
                  className="inline-flex rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
                >
                  {item.label}
                  {item.detail ? (
                    <span className="ml-1 text-muted-foreground">· {item.detail}</span>
                  ) : null}
                </ReadinessAnchor>
              </li>
            ))}
            {check.count > READINESS_ITEM_LIMIT ? (
              <li className="px-1 text-xs text-muted-foreground">
                e mais {check.count - READINESS_ITEM_LIMIT}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {done ? null : (
        <div className="shrink-0">
          <Button asChild size="sm" variant="secondary">
            <ReadinessAnchor link={check.action}>
              {check.action.label}
              <ArrowRight className="size-4" aria-hidden />
            </ReadinessAnchor>
          </Button>
        </div>
      )}
    </li>
  );
}

function ReadinessAnchor({
  link,
  className,
  children,
}: {
  link: ReadinessLink;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={link.to as never}
      params={link.params as never}
      search={link.search as never}
      className={className}
    >
      {children}
    </Link>
  );
}
