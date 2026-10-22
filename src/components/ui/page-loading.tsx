import { SigaWordmark } from "./siga-logo";
import { FeedbackIcon } from "@/components/ui/feedback-icon";
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
          <span aria-hidden="true" className="siga-brand-wait">
            <SigaWordmark />
          </span>
          <span className="sr-only">{message}</span>
        </div>
      ) : (
        <div role="status" className="max-w-full px-5 text-center">
          <FeedbackIcon state="processing" className="mx-auto size-[28px] text-primary" />
          {message ? (
            <p className="mt-3 break-words text-[13px] font-medium leading-[20px] text-muted-foreground">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
