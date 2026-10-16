import { SigaWordmark } from "./siga-logo";
import { cn } from "@/lib/utils";

interface PageLoadingProps {
  message?: string;
  className?: string;
  minHeight?: string;
  brandOnly?: boolean;
}

export function PageLoading({
  message = "A carregar…",
  className,
  minHeight = "min-h-screen",
  brandOnly = false,
}: PageLoadingProps) {
  return (
    <div className={cn("flex items-center justify-center bg-background", minHeight, className)}>
      {brandOnly ? (
        <div role="status" className="siga-brand-reveal text-[32px]">
          <SigaWordmark />
          <span className="sr-only">{message}</span>
        </div>
      ) : (
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          {message ? (
            <p className="text-muted-foreground mt-2 text-sm font-medium">{message}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
