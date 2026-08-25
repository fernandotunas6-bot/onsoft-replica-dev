import { useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
} from "lucide-react";
import { IconChip } from "@/components/ui/icon-chip";

export interface CashFlowMonthData {
  month: string;
  expectedAmount: number;
  actualAmount: number;
  forecastAmount: number;
}

interface CashFlowForecastChartProps {
  data?: CashFlowMonthData[];
  averageCollectionRate?: number;
  forecastInadimplenciaRate?: number;
  mainPaymentChannel?: string;
}

export function CashFlowForecastChart({
  data = [],
  averageCollectionRate,
  forecastInadimplenciaRate,
  mainPaymentChannel,
}: CashFlowForecastChartProps) {
  const formatKz = (val: number) =>
    new Intl.NumberFormat("pt-AO", {
      style: "currency",
      currency: "AOA",
      maximumFractionDigits: 0,
    }).format(val);

  const hasData = data.length > 0;

  const totalForecastNext3Months = hasData
    ? data.slice(Math.max(0, data.length - 3)).reduce((sum, item) => sum + item.forecastAmount, 0)
    : 0;

  const maxVal = hasData
    ? Math.max(...data.map((d) => Math.max(d.expectedAmount, d.actualAmount, d.forecastAmount)), 1)
    : 1;

  return (
    <div className="surface-card p-6 space-y-5 rounded-2xl border border-border shadow-sm">
      {/* CABEÇALHO DA PROJEÇÃO FINANCEIRA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <IconChip icon={TrendingUp} tone="warning" size="md" />
          <div>
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              Projeção de Fluxo de Caixa
            </h3>
            <p className="text-xs text-muted-foreground">
              Estimativa de receita com base no comportamento de pagamento das turmas e matrículas
              ativas
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-muted-foreground uppercase font-bold block">
            Previsão Período
          </span>
          <span className="text-lg font-extrabold text-primary font-mono">
            {formatKz(totalForecastNext3Months)}
          </span>
        </div>
      </div>

      {/* MÉTRICAS CHAVE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold">
            Taxa Média de Liquidação
          </span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-foreground font-mono">
              {averageCollectionRate !== undefined ? `${averageCollectionRate}%` : "—"}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold">
            Inadimplência Prevista
          </span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-foreground font-mono">
              {forecastInadimplenciaRate !== undefined ? `${forecastInadimplenciaRate}%` : "—"}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold">Canal Mais Utilizado</span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-primary">
              {mainPaymentChannel ?? "Aguardando lançamentos"}
            </span>
            <ShieldCheck className="size-4 text-primary" />
          </div>
        </div>
      </div>

      {/* GRÁFICO BARRA VISUAL DE PROJEÇÃO */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-bold">
          <span>Mês</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-primary" /> Realizado / Pago
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-warning" /> Projetado (Futuro)
            </span>
          </div>
        </div>

        {!hasData ? (
          <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
            Sem dados suficientes de caixa ou faturas emitidas para gerar gráfico de projeção.
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((item) => {
              const isFuture = item.actualAmount === 0;
              const displayVal = isFuture ? item.forecastAmount : item.actualAmount;
              const percent = Math.min(100, Math.round((displayVal / maxVal) * 100));

              return (
                <div key={item.month} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-foreground w-10">{item.month}</span>
                    <span className="text-muted-foreground">{formatKz(displayVal)}</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-secondary/50 overflow-hidden">
                    <div
                      style={{ width: `${percent}%` }}
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFuture ? "bg-warning" : "bg-primary"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
