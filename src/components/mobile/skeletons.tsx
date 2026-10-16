import { cn } from "@/lib/utils";

/**
 * Skeletons por forma de conteúdo (§48). Um spinner grande no meio do ecrã não
 * diz nada sobre o que vem a seguir; uma lista de linhas cinzentas diz "vem uma
 * lista" e o salto de layout desaparece quando os dados chegam.
 */
function Bar({ className }: { className?: string }) {
  return (
    <span
      className={cn("block max-w-full rounded bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

export function EntityListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex min-h-[64px] items-center gap-3 px-4 py-3">
          <Bar className="size-[36px] shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <Bar className="h-[14px] w-[55%]" />
            <Bar className="h-[12px] w-[35%]" />
          </span>
          <Bar className="h-[20px] w-[64px] rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
          <Bar className="h-[12px] w-[80px]" />
          <Bar className="h-[28px] w-[96px]" />
          <Bar className="h-[12px] w-[64px]" />
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="min-w-0 space-y-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Bar className="size-[64px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-[16px] w-[160px]" />
          <Bar className="h-[12px] w-[96px]" />
          <Bar className="h-[20px] w-[80px] rounded-full" />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <Bar className="h-[12px] w-[64px]" />
            <Bar className="h-[20px] w-[80px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="min-w-0 space-y-4" aria-hidden>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-1.5">
          <Bar className="h-[12px] w-[96px]" />
          <Bar className="h-[44px] w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function AgendaSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex min-h-[56px] min-w-0 gap-3">
          <Bar className="h-[12px] w-[40px] shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5 border-l border-border pl-3">
            <Bar className="h-[14px] w-[128px]" />
            <Bar className="h-[12px] w-[80px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
