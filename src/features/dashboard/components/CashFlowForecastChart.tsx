import { useState } from "react";
import { TrendingUp, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, ShieldCheck } from "lucide-react";
import { IconChip } from "@/components/ui/icon-chip";

interface CashFlowMonthData {
  month: string;
  expectedAmount: number;
  actualAmount: number;
  forecastAmount: number;
}

const mockCashFlow: CashFlowMonthData[] = [
  { month: "Set", expectedAmount: 4500000, actualAmount: 4350000, forecastAmount: 4400000 },
  { month: "Out", expectedAmount: 4500000, actualAmount: 4200000, forecastAmount: 4300000 },
  { month: "Nov", expectedAmount: 4500000, actualAmount: 4480000, forecastAmount: 4450000 },
  { month: "Dez", expectedAmount: 4800000, actualAmount: 4750000, forecastAmount: 4700000 },
  { month: "Jan", expectedAmount: 4500000, actualAmount: 0, forecastAmount: 4380000 },
  { month: "Fev", expectedAmount: 4500000, actualAmount: 0, forecastAmount: 4420000 },
  { month: "Mar", expectedAmount: 4500000, actualAmount: 0, forecastAmount: 4490000 },
];

export function CashFlowForecastChart() {
  const formatKz = (val: number) =>
    new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(
      val,
    );

  const totalForecastNext3Months = mockCashFlow
    .slice(4, 7)
    .reduce((sum, item) => sum + item.forecastAmount, 0);

  const averageCollectionRate = 96.2; // %

  return (
    <div className="surface-card p-6 space-y-5 rounded-2xl border border-border shadow-sm">
      {/* CABEÇALHO DA PROJEÇÃO FINANCEIRA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <IconChip icon={TrendingUp} tone="warning" size="md" />
          <div>
            <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
              Projeção de Fluxo de Caixa (Próximos 6 Meses)
            </h3>
            <p className="text-xs text-muted-foreground">
              Estimativa de receita com base no comportamento de pagamento das turmas e matrículas ativas
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-muted-foreground uppercase font-bold block">Previsão 3 Meses</span>
          <span className="text-lg font-extrabold text-primary font-mono">{formatKz(totalForecastNext3Months)}</span>
        </div>
      </div>

      {/* MÉTRICAS CHAVE */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold">Taxa Média de Liquidação</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-foreground font-mono">{averageCollectionRate}%</span>
            <span className="text-xs text-success font-bold flex items-center">
              <ArrowUpRight className="size-3.5" /> +2.4%
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold">Inadimplência Prevista</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-foreground font-mono">3.8%</span>
            <span className="text-xs text-success font-bold flex items-center">
              <ArrowDownRight className="size-3.5" /> -1.1%
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-semibold">Canal Mais Utilizado</span>
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-primary">Multicaixa Express (78%)</span>
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

        <div className="space-y-3">
          {mockCashFlow.map((item) => {
            const isFuture = item.actualAmount === 0;
            const displayVal = isFuture ? item.forecastAmount : item.actualAmount;
            const maxVal = 5000000;
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
      </div>
    </div>
  );
}
