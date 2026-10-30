import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { contextEntryLink } from "@/features/intelligence/context-registry";
import {
  entityKindLabel,
  groupContextEntries,
  type EntityNavigation,
} from "@/features/intelligence/entity-navigation";

/**
 * Menu da entidade no hub «Mais» (SIGA Context Engine, telemóvel). As mesmas
 * entradas, a mesma entrada activa e o mesmo «Voltar» da sidebar do computador,
 * com as linhas de 56 px do hub. Fecha o hub ao escolher: mudar de secção do
 * aluno só muda a pesquisa da URL, e o hub não fecharia sozinho.
 */
export function MobileEntityNav({
  navigation,
  areaTitle,
  onNavigate,
}: {
  navigation: EntityNavigation;
  areaTitle: string | null;
  onNavigate: () => void;
}) {
  const { context, entries, activeId, back } = navigation;
  const inner = context.trail.at(-1)!;
  const kind = entityKindLabel(inner.type);
  const parents = context.trail.slice(0, -1).map((frame) => frame.label);

  return (
    <section aria-label={`${kind}: ${inner.label}`} data-context-nav="">
      <Link
        to={back.to}
        {...(back.search ? { search: back.search as never } : {})}
        onClick={onNavigate}
        className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ArrowLeft className="size-[18px]" aria-hidden />
        {areaTitle ? `Voltar a ${areaTitle}` : "Voltar"}
      </Link>
      <div className="px-1 pt-2 pb-3">
        <p className="break-words text-[15px] font-semibold leading-[22px] text-foreground">
          <span className="font-normal text-muted-foreground">{kind} · </span>
          {inner.label}
        </p>
        {parents.length > 0 ? (
          <p className="mt-0.5 break-words text-[12px] leading-[18px] text-muted-foreground">
            {parents.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="space-y-5">
        {groupContextEntries(entries).map((group) => (
          <section key={group.title}>
            <h3 className="px-1 pb-2 text-[12px] font-medium leading-[20px] text-muted-foreground">
              {group.title}
            </h3>
            <ul className="overflow-hidden rounded-xl border border-border bg-card">
              {group.items.map((entry) => {
                const link = contextEntryLink(entry, context);
                const Icon = entry.icon;
                return (
                  <li key={entry.id} className="border-b border-border last:border-b-0">
                    <Link
                      to={link.to}
                      search={link.search as never}
                      aria-current={entry.id === activeId ? "page" : undefined}
                      onClick={onNavigate}
                      className="flex min-h-[56px] min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-secondary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
                    >
                      <span className="inline-flex size-[36px] shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 break-words text-[14px] leading-[20px]">
                        {entry.label}
                      </span>
                      <ChevronRight
                        className="size-[18px] shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
