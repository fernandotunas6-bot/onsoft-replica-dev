import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          /*
           * Telemóvel/tablet: 44 pixels CSS de toque e texto de 16px, mesmo
           * com a raiz reduzida. A partir de lg, manter a densidade desktop.
           */
          "flex h-[44px] min-h-[44px] w-full rounded-md border border-input bg-transparent px-3 py-1 text-[16px] shadow-sm lg:h-9 lg:min-h-0 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
