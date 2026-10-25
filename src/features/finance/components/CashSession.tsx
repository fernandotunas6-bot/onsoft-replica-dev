import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  approveCashDifference,
  closeCashSession,
  confirmCashDeposit,
  recordCashDeposit,
  reverseCashDeposit,
  getCashSessionState,
  listCashSessionReports,
  openCashSession,
} from "@/features/finance/cash-session.functions";
import { moduleIcons } from "@/lib/app-icons";
import { kwanza } from "@/lib/currency";
import { schoolTodayIso } from "@/lib/school-date";
import { toast } from "@/lib/toast";
import type { CashSessionReport } from "@/features/finance/cash-session-report";

export const cashSessionKey = ["finance", "cash-session"] as const;
const cashClosingsKey = ["finance", "cash-session", "closings"] as const;

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-AO", {
    day: "2-digit",
    month: "short",
  });
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-AO", { hour: "2-digit", minute: "2-digit" });

/** Valor escrito no formulário, com vírgula ou ponto decimal. */
const amountOf = (value: string | undefined) => Number(String(value ?? "").replace(",", "."));

function useCashSession() {
  return useQuery({
    queryKey: cashSessionKey,
    queryFn: () => getCashSessionState(),
    retry: false,
  });
}

/**
 * Estado do caixa no topo de Movimentos de Caixa: abrir com o fundo de maneio,
 * fechar com a contagem. Sem a migração aplicada, não mostra nada.
 */
export function CashSessionBar() {
  const queryClient = useQueryClient();
  const state = useCashSession();
  const Icon = moduleIcons.treasury;
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: cashSessionKey }),
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
    ]);

  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {(state.error as Error).message}
      </p>
    );
  }
  const data = state.data;
  if (!data?.available) return null;
  const session = data.session;
  const today = schoolTodayIso();
  const transition = Boolean(data.enforceFrom && today < data.enforceFrom);

  return (
    <section
      aria-label="Estado do caixa"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        {session ? (
          <div className="min-w-0">
            <p className="text-sm font-semibold">Caixa aberto desde as {hour(session.openedAt)}</p>
            <p className="text-xs text-muted-foreground">
              Fundo {kwanza(session.openingFloat)} · numerário esperado agora{" "}
              <strong className="text-foreground">{kwanza(session.expectedCash)}</strong>
            </p>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-semibold">Caixa fechado</p>
            <p className="text-xs text-muted-foreground">
              {transition && data.enforceFrom
                ? `Até ${day(data.enforceFrom)}, os recebimentos em numerário ainda entram sem caixa aberto; depois, são recusados.`
                : "Os recebimentos e as despesas em numerário precisam do caixa aberto."}
            </p>
          </div>
        )}
      </div>

      {session ? (
        <div className="flex flex-wrap gap-2">
          <QuickFormModal
            eyebrow="Tesouraria"
            title="Depositar no banco"
            description="Numerário que sai da gaveta para o banco. Fica por confirmar até outra pessoa o ver no extracto."
            submitLabel="Registar depósito"
            successDescription="Depósito registado."
            fields={[
              { name: "valor", label: "Valor depositado (Kz)", type: "number" },
              { name: "talao", label: "Nº do talão de depósito", full: true },
            ]}
            renderHint={(values) => {
              const amount = amountOf(values["valor"]);
              if (!values["valor"] || !Number.isFinite(amount)) return null;
              return (
                <p className="text-sm">
                  Na gaveta agora {kwanza(session.expectedCash)} · fica{" "}
                  <strong>{kwanza(session.expectedCash - amount)}</strong>
                  {amount > session.expectedCash ? " — maior do que o que há na gaveta." : ""}
                </p>
              );
            }}
            onSubmit={async (values) => {
              await recordCashDeposit({
                data: { amount: amountOf(values["valor"]), bankReference: values["talao"] ?? "" },
              });
              await refresh();
            }}
            trigger={(open) => (
              <Button variant="outline" onClick={open}>
                Depositar no banco
              </Button>
            )}
          />
          <QuickFormModal
            eyebrow="Tesouraria"
            title="Fechar caixa"
            description="Conte o numerário na gaveta. A diferença para o esperado fica gravada e, se não for zero, segue para aprovação."
            submitLabel="Fechar caixa"
            successDescription="Caixa fechado."
            fields={[
              { name: "contado", label: "Numerário contado (Kz)", type: "number" },
              {
                name: "motivo",
                label: "Motivo da diferença",
                type: "textarea",
                required: false,
                full: true,
              },
            ]}
            renderHint={(values) => {
              if (!values["contado"]) return null;
              const difference = amountOf(values["contado"]) - session.expectedCash;
              if (!Number.isFinite(difference)) return null;
              return (
                <p className="text-sm">
                  Esperado {kwanza(session.expectedCash)} · diferença{" "}
                  <strong>{kwanza(difference)}</strong>
                  {difference !== 0 ? " — indique o motivo." : ""}
                </p>
              );
            }}
            onSubmit={async (values) => {
              await closeCashSession({
                data: {
                  sessionId: session.id,
                  countedCash: amountOf(values["contado"]),
                  reason: values["motivo"] || undefined,
                },
              });
              await refresh();
            }}
            trigger={(open) => (
              <Button variant="outline" onClick={open}>
                Fechar caixa
              </Button>
            )}
          />
        </div>
      ) : (
        <QuickFormModal
          eyebrow="Tesouraria"
          title="Abrir caixa"
          description="Conte o fundo de maneio que fica na gaveta para trocos."
          submitLabel="Abrir caixa"
          successDescription="Caixa aberto."
          fields={[
            {
              name: "fundo",
              label: "Fundo de maneio (Kz)",
              type: "number",
              defaultValue: 0,
            },
          ]}
          onSubmit={async (values) => {
            await openCashSession({ data: { openingFloat: amountOf(values["fundo"]) } });
            await refresh();
          }}
          trigger={(open) => <Button onClick={open}>Abrir caixa</Button>}
        />
      )}
    </section>
  );
}

/** Fechos com diferença por aprovar, na Tesouraria. Quem fechou não aprova. */
export function CashDifferencesPanel() {
  const queryClient = useQueryClient();
  const state = useCashSession();
  const approve = useMutation({
    mutationFn: (sessionId: string) => approveCashDifference({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Diferença aprovada");
      void queryClient.invalidateQueries({ queryKey: cashSessionKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falhou."),
  });
  const data = state.data;
  if (!data?.available || !data.pending.length) return null;

  return (
    <Panel
      title="Diferenças de caixa por aprovar"
      description="Cada fecho com diferença fica aqui até um Administrador que não o fechou o aprovar."
    >
      <ul className="divide-y divide-border text-sm">
        {data.pending.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p>
                Fecho de {day(row.closedAt)} às {hour(row.closedAt)} ·{" "}
                <strong>{row.difference > 0 ? "sobra" : "falta"}</strong> de{" "}
                {kwanza(Math.abs(row.difference))}
              </p>
              {row.reason ? <p className="text-xs text-muted-foreground">{row.reason}</p> : null}
            </div>
            {data.canApprove && !row.closedByMe ? (
              <Button
                size="sm"
                variant="outline"
                disabled={approve.isPending}
                onClick={() => approve.mutate(row.id)}
              >
                Aprovar
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                {row.closedByMe ? "Fechado por si — aprova outro Administrador" : "Por aprovar"}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Depósitos no banco por confirmar, na Tesouraria: quem não registou o depósito confirma-o
 * quando o vê no extracto; os da sessão aberta ainda se anulam, com motivo.
 */
export function CashDepositsPanel() {
  const queryClient = useQueryClient();
  const state = useCashSession();
  const confirm = useMutation({
    mutationFn: (depositId: string) => confirmCashDeposit({ data: { depositId } }),
    onSuccess: () => {
      toast.success("Depósito confirmado");
      void queryClient.invalidateQueries({ queryKey: cashSessionKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falhou."),
  });
  const data = state.data;
  if (!data?.available || !data.deposits.length) return null;

  return (
    <Panel
      title="Depósitos por confirmar"
      description="Numerário levado ao banco. Confirme quando aparecer no extracto; quem depositou não confirma."
    >
      <ul className="divide-y divide-border text-sm">
        {data.deposits.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p>
                {kwanza(row.amount)} · talão <span className="font-mono">{row.reference}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {day(row.depositedAt)} às {hour(row.depositedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.inOpenSession ? (
                <QuickFormModal
                  eyebrow="Tesouraria"
                  title="Anular depósito"
                  description="Só para um depósito registado por engano. O valor volta ao numerário esperado na gaveta."
                  submitLabel="Anular"
                  successDescription="Depósito anulado."
                  fields={[{ name: "motivo", label: "Motivo", type: "textarea", full: true }]}
                  onSubmit={async (values) => {
                    await reverseCashDeposit({
                      data: { depositId: row.id, reason: values["motivo"] ?? "" },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: cashSessionKey }),
                      queryClient.invalidateQueries({ queryKey: ["finance"] }),
                    ]);
                  }}
                  trigger={(open) => (
                    <Button size="sm" variant="ghost" onClick={open}>
                      Anular
                    </Button>
                  )}
                />
              ) : null}
              {row.depositedByMe ? (
                <p className="text-xs text-muted-foreground">
                  Registado por si — confirma outra pessoa
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(row.id)}
                >
                  Confirmar no extracto
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const CLOSING_STATE: Record<CashSessionReport["state"], string> = {
  balanced: "Certo",
  pending: "Por aprovar",
  approved: "Aprovada",
};

/**
 * Relatório dos últimos fechos, na Tesouraria (§4.6): o que entrou e saiu da gaveta em
 * cada sessão, o esperado, o contado e a diferença. Sem a migração, não mostra nada.
 */
export function CashClosingsPanel() {
  const closings = useQuery({
    queryKey: cashClosingsKey,
    queryFn: () => listCashSessionReports(),
    retry: false,
  });
  const rows = closings.data ?? [];
  if (closings.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {(closings.error as Error).message}
      </p>
    );
  }
  if (!rows.length) return null;

  return (
    <Panel
      title="Fechos de caixa"
      description="Os últimos fechos: fundo, entradas e saídas em numerário, depósitos no banco, o esperado e o contado."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Fecho</th>
              <th className="py-2 pr-3 text-right">Fundo</th>
              <th className="py-2 pr-3 text-right">Entradas</th>
              <th className="py-2 pr-3 text-right">Saídas</th>
              <th className="py-2 pr-3 text-right">Depósitos</th>
              <th className="py-2 pr-3 text-right">Esperado</th>
              <th className="py-2 pr-3 text-right">Contado</th>
              <th className="py-2 pr-3 text-right">Diferença</th>
              <th className="py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {day(row.closedAt)} · {hour(row.openedAt)}–{hour(row.closedAt)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{kwanza(row.openingFloat)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{kwanza(row.cashIn)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{kwanza(row.cashOut)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{kwanza(row.deposits)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{kwanza(row.expectedCash)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{kwanza(row.countedCash)}</td>
                <td className="py-2 pr-3 text-right font-medium tabular-nums">
                  {row.difference === 0
                    ? "—"
                    : `${row.difference > 0 ? "sobra" : "falta"} ${kwanza(Math.abs(row.difference))}`}
                </td>
                <td className="py-2">
                  <p>{CLOSING_STATE[row.state]}</p>
                  {row.reason ? (
                    <p className="text-xs text-muted-foreground">{row.reason}</p>
                  ) : null}
                  {row.consistent ? null : (
                    <p className="text-xs text-destructive">
                      Os movimentos mudaram depois do fecho: confira o registo de auditoria.
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
