import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Número de aluno, matrícula ou documento — um só desenho em todas as listas.
 *
 * O número novo é «1» + ano + 4 dígitos (1260001). Lê-se melhor em dois grupos,
 * por isso o «126» (ano) fica em tom mais leve e há um pequeno intervalo antes
 * da ordem: a vista é «126 0001», mas copiar dá «1260001» (o intervalo é
 * margem, não um espaço). Inter com `tabular-nums` (como `MoneyValue`) mantém a
 * coluna alinhada sem a letra de máquina de escrever do monoespaçado. Números de
 * outros formatos (séries fiscais, antigos por renumerar) aparecem tal como são.
 */
export type IdentifierKind = "student" | "enrollment" | "document";

const KIND_LABEL: Record<IdentifierKind, string> = {
  student: "Nº de aluno",
  enrollment: "Nº de matrícula",
  document: "Nº do documento",
};

const YEARLY = /^1(\d{2})(\d{4})$/;

export interface IdentifierValueProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "children"
> {
  value: string | null | undefined;
  kind?: IdentifierKind;
  /** «chip» (moldura discreta, para listas e tabelas) ou «plain» (dentro de texto). */
  variant?: "chip" | "plain";
  /** Escreve o rótulo antes do número («Nº de aluno 126 0001»). */
  showLabel?: boolean;
  emptyLabel?: string;
  size?: "xs" | "sm";
}

export function IdentifierValue({
  value,
  kind = "student",
  variant = "chip",
  showLabel = false,
  emptyLabel = "—",
  size = "xs",
  className,
  ...props
}: IdentifierValueProps) {
  const code = String(value ?? "").trim();
  const label = KIND_LABEL[kind];
  if (!code) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        <span className="sr-only">{label}: </span>
        {emptyLabel}
      </span>
    );
  }
  const yearly = YEARLY.exec(code);
  const title = yearly ? `${label} ${code} · série de 20${yearly[1]}` : `${label} ${code}`;
  return (
    <span
      title={title}
      translate="no"
      className={cn(
        "inline-flex items-baseline whitespace-nowrap tabular-nums tracking-normal",
        size === "xs" ? "text-xs" : "text-sm",
        variant === "chip" &&
          "rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 leading-none",
        className,
      )}
      {...props}
    >
      {showLabel ? (
        <span className="mr-1.5 select-none font-medium text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only select-none">{label} </span>
      )}
      {yearly ? (
        <>
          <span className="text-muted-foreground">1{yearly[1]}</span>
          <span className="ml-[0.2em] font-semibold text-foreground">{yearly[2]}</span>
        </>
      ) : (
        <span className="font-semibold text-foreground">{code}</span>
      )}
    </span>
  );
}
