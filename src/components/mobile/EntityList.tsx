import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MoreVertical } from "lucide-react";

import { MediaAvatar } from "@/components/ui/media-frame";

import { cn } from "@/lib/utils";

/**
 * Lista de entidades (§18–§19). É a forma mobile de **todas** as tabelas do
 * SIGA: aluno, professor, funcionário, turma, pagamento, documento, escola.
 *
 * A regra é uma linha por entidade com quatro zonas fixas, sempre na mesma
 * ordem — avatar, identidade, meta, estado. Ler a lista de alunos e a de
 * faturas tem de ser o mesmo gesto, e é isso que faz a aplicação parecer uma só.
 *
 * Não é um cartão por linha: cartões empilhados a 360px dão 3 entidades por
 * ecrã e obrigam a rolar uma lista de 1.200 alunos. Linhas separadas por um
 * traço dão 8–9 e continuam a respirar.
 */
export type EntityListItem = {
  id: string;
  /** Linha 1: o nome pelo qual a escola conhece a entidade. */
  title: string;
  /** Linha 2: o contexto que a distingue — "10ª Classe · Turma A". */
  subtitle?: React.ReactNode;
  /** Linha 3, opcional: o número que importa (dívida, valor, percentagem). */
  meta?: React.ReactNode;
  /** Canto direito: estado, sempre com o mesmo vocabulário (§43). */
  status?: React.ReactNode;
  /** Iniciais ou fotografia. */
  leading?: React.ReactNode;
  /** Navegação. Com `to`, a linha inteira é o alvo de toque. */
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  onSelect?: () => void;
  /** Menu "⋯" com as acções secundárias (abre uma ActionSheet). */
  onActions?: () => void;
  selected?: boolean;
};

export function EntityList({
  items,
  className,
  /** Modo de selecção múltipla (§106): só aparece quando é pedido. */
  selectable = false,
  onToggleSelect,
  emptyState,
}: {
  items: EntityListItem[];
  className?: string;
  selectable?: boolean;
  onToggleSelect?: (id: string) => void;
  emptyState?: React.ReactNode;
}) {
  if (!items.length && emptyState) return <>{emptyState}</>;

  return (
    <ul className={cn("divide-y divide-border", className)}>
      {items.map((item) => (
        <li key={item.id}>
          <EntityRow item={item} selectable={selectable} onToggleSelect={onToggleSelect} />
        </li>
      ))}
    </ul>
  );
}

export function EntityRow({
  item,
  selectable = false,
  onToggleSelect,
}: {
  item: EntityListItem;
  selectable?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const body = (
    <>
      {item.leading ? <span className="shrink-0">{item.leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[14px] font-medium leading-snug text-foreground">
          {item.title}
        </span>
        {item.subtitle ? (
          <span className="mt-1 line-clamp-2 break-words text-[12px] leading-relaxed text-muted-foreground">
            {item.subtitle}
          </span>
        ) : null}
        {item.meta || item.status ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] [&>*]:max-w-full">
            {item.meta ? <span className="break-words">{item.meta}</span> : null}
            {item.status ? <span className="max-w-full">{item.status}</span> : null}
          </span>
        ) : null}
      </span>
    </>
  );

  const rowClass = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
    "min-h-[64px] rounded-lg outline-none hover:bg-secondary/35 active:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    item.selected && "bg-primary-soft/40",
  );

  return (
    <div className="flex items-center">
      {selectable ? (
        <label className="touch-target flex items-center justify-center pl-4">
          <input
            type="checkbox"
            aria-label={`Seleccionar ${item.title}`}
            checked={Boolean(item.selected)}
            onChange={() => onToggleSelect?.(item.id)}
            className="size-4.5 rounded border-border accent-primary"
          />
        </label>
      ) : null}

      {item.to ? (
        <Link
          to={item.to}
          params={item.params as never}
          search={item.search as never}
          className={cn(rowClass, "min-w-0 flex-1")}
        >
          {body}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : (
        <button type="button" onClick={item.onSelect} className={cn(rowClass, "min-w-0 flex-1")}>
          {body}
          {item.onSelect ? (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : null}
        </button>
      )}

      {item.onActions ? (
        <button
          type="button"
          onClick={item.onActions}
          aria-label={`Acções de ${item.title}`}
          className="touch-target mr-1 inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-secondary"
        >
          <MoreVertical className="size-4.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Avatar de uma entidade na lista.
 *
 * Delega no `MediaAvatar` de propósito: é ele que resolve o `photo_url` — as
 * fotografias de pessoas vivem em Storage privado e precisam de URL assinado.
 * Uma imagem crua com o `photo_url` mostrava um quadrado vazio em todas elas, e a
 * lista ficava sem o único elemento que distingue dois alunos com nomes
 * parecidos. Sem fotografia, o `MediaAvatar` desenha as iniciais (§69).
 */
export function EntityAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  return (
    <MediaAvatar
      src={photoUrl ?? null}
      alt={name}
      className={cn("size-9 rounded-full object-cover", className)}
      textClassName="text-[11px] font-medium"
    />
  );
}
