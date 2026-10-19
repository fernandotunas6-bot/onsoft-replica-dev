import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_MODULES, planDetail } from "./plan-details";

/**
 * «Ver mais» de um pacote: para quem é, o que o distingue e os módulos que
 * todos os planos incluem. Fechado por omissão para os cartões ficarem curtos.
 */
export function PlanDetailsMore({ code, className }: { code: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const detail = planDetail(code);
  if (!detail) return null;
  return (
    <div className={cn("text-xs", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        {open ? "Ver menos" : "Ver mais"}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id={id} className="mt-2 grid gap-3 rounded-lg bg-muted/50 p-3 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Ideal para: </span>
            {detail.idealFor}
          </p>
          <ul className="grid gap-1">
            {detail.highlights.map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLAN_MODULES.map((group) => (
              <div key={group.title}>
                <p className="font-medium text-foreground">{group.title}</p>
                <ul className="mt-0.5 grid gap-0.5">
                  {group.items.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
