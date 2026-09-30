import { CalendarCheck, Check, ChevronDown, GraduationCap, Menu, Receipt, Search, Users } from "lucide-react"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

const STEPS = [
  { label: "Ano lectivo 2026/2027", icon: CalendarCheck },
  { label: "Classes 10ª–12ª e turmas", icon: GraduationCap },
  { label: "Propina e matrícula", icon: Receipt },
  { label: "Convidar a equipa", icon: Users },
]

const TODAY = [
  { time: "07:30", label: "10ª CFB A — Matemática" },
  { time: "09:15", label: "Pagamentos a confirmar (3)" },
  { time: "11:00", label: "Pauta do 1º trimestre" },
]

/**
 * Telemóvel com o SIGA a arrumar uma escola nova: os passos do arranque vão
 * ficando feitos, em ciclo. É o produto a falar por si — o que a escola vai
 * ver no primeiro dia — em vez de uma captura de ecrã parada.
 */
export function SigaPhoneDemo({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Pré-visualização do SIGA Plus no telemóvel: o arranque da escola com os passos a ficarem concluídos."
      className={cn(
        "relative w-[260px] rounded-[2.4rem] border border-white/60 bg-white/85 p-3 shadow-[0_30px_80px_-20px_oklch(0.35_0.18_285/0.6)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85",
        className,
      )}
    >
      <div className="rounded-[1.9rem] bg-background/60 px-4 pb-5 pt-3 text-foreground">
        <div className="flex items-center justify-between text-[11px] font-semibold">
          <span>08:00</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-foreground/80" />
            <span className="h-2 w-5 rounded-sm bg-foreground/80" />
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="grid size-8 place-items-center rounded-full bg-muted">
            <Menu className="size-4" />
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold">
            SIGA Plus <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
          <span className="grid size-8 place-items-center rounded-full bg-muted">
            <Search className="size-4" />
          </span>
        </div>
        <div className="mt-3 flex gap-1.5 text-[11px]">
          <span className="rounded-full px-2.5 py-1 text-muted-foreground">Hoje</span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium">Arranque</span>
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Secretaria
          </span>
        </div>

        <p className="mt-4 text-xs font-semibold">Arranque da escola</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
          <div className="demo-bar h-full rounded-full bg-primary" />
        </div>
        <ul className="mt-3 grid gap-2.5">
          {STEPS.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2.5 text-[12.5px]">
              <step.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{step.label}</span>
              <span className="relative grid size-5 place-items-center rounded-full border border-border">
                <span
                  className="demo-check absolute inset-0 grid place-items-center rounded-full bg-emerald-500 text-white"
                  style={{ "--delay": `${index * 1.6}s` } as CSSProperties}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs font-semibold">Hoje na escola</p>
        <ul className="mt-2 grid gap-2">
          {TODAY.map((item) => (
            <li key={item.label} className="flex items-center gap-2 rounded-xl bg-muted/70 px-2.5 py-2 text-[12px]">
              <span className="font-mono text-[11px] text-muted-foreground">{item.time}</span>
              <span className="truncate">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
