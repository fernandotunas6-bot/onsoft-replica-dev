import { cn } from "@/lib/utils";

/**
 * Skeletons por forma de conteúdo (§48). Um spinner grande no meio do ecrã não
 * diz nada sobre o que vem a seguir; uma lista de linhas cinzentas diz "vem uma
 * lista" e o salto de layout desaparece quando os dados chegam.
 */
function Bar({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded bg-muted", className)} />;
}

export function EntityListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3">
          <Bar className="size-9 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <Bar className="h-3.5 w-[55%]" />
            <Bar className="h-3 w-[35%]" />
          </span>
          <Bar className="h-5 w-16 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-border bg-card p-3.5">
          <Bar className="h-3 w-20" />
          <Bar className="h-7 w-24" />
          <Bar className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Bar className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-4 w-40" />
          <Bar className="h-3 w-24" />
          <Bar className="h-5 w-20 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-border bg-card p-3.5">
            <Bar className="h-3 w-16" />
            <Bar className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-1.5">
          <Bar className="h-3 w-24" />
          <Bar className="h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function AgendaSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Bar className="h-3 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5 border-l border-border pl-3">
            <Bar className="h-3.5 w-32" />
            <Bar className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
