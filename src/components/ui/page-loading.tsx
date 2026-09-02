import { cn } from "@/lib/utils";

interface PageLoadingProps {
  message?: string;
  className?: string;
  minHeight?: string;
}

export function PageLoading({
  message = "A carregar…",
  className,
  minHeight = "min-h-screen",
}: PageLoadingProps) {
  return (
    <div className={cn("flex items-center justify-center bg-background", minHeight, className)}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        {message ? (
          <p className="text-muted-foreground mt-2 text-sm font-medium">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
