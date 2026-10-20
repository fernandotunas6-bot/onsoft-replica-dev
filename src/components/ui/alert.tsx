import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-3.5 py-2.5 text-xs md:text-sm [&>svg]:absolute [&>svg]:left-3.5 [&>svg]:top-3 [&>svg]:size-4 [&>svg]:text-current [&>svg~*]:pl-6.5",
  {
    variants: {
      variant: {
        default: "border-border/80 bg-background text-foreground",
        success: "border-success/25 bg-success/5 text-success-strong",
        warning: "border-warning/30 bg-warning/10 text-warning-strong",
        info: "border-info/25 bg-info/5 text-info-strong",
        destructive: "border-destructive/30 bg-destructive/5 text-destructive-strong",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("mb-1 font-medium leading-snug tracking-tight text-xs md:text-sm", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs leading-relaxed md:text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
