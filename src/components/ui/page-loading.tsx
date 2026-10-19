import { FeedbackIcon } from "@/components/ui/feedback-icon";
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
      <div className="text-center" role="status" aria-live="polite">
        <FeedbackIcon state="processing" className="size-8 text-primary mx-auto" />
        {message ? (
          <p className="text-muted-foreground mt-2 text-sm font-medium">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
