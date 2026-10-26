import type { SVGProps } from "react";
import { actionIcons, statusIcons } from "@/lib/app-icons";
import { cn } from "@/lib/utils";

export type FeedbackState =
  "success" | "rejected" | "error" | "warning" | "info" | "processing" | "pending";

export interface FeedbackIconProps extends SVGProps<SVGSVGElement> {
  state: FeedbackState;
  /** Stored statuses stay still; live feedback may animate. */
  animated?: boolean;
}

/** Decorative SVG: the surrounding message supplies the accessible label. */
export function FeedbackIcon({ state, animated = true, className, ...props }: FeedbackIconProps) {
  const Icon = state === "processing" ? actionIcons.loading : statusIcons[state];
  return (
    <Icon
      {...props}
      key={state}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      data-feedback-state={state}
      data-feedback-motion={animated ? "on" : "off"}
      className={cn("siga-feedback-icon size-4 shrink-0", className)}
    />
  );
}
