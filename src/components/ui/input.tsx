import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          /*
           * Altura: 44px no telemóvel, 36px no computador.
           *
           * 44px é o alvo mínimo de toque das WCAG 2.5.8 e da HIG da Apple. Com
           * 36px o campo é tocável, mas erra-se para o campo de cima ou de baixo
           * num formulário denso — e num formulário de matrícula com 20 campos
           * isso significa escrever a data no sítio do nome. No computador,
           * onde o alvo é o rato, 36px continua a ser o certo.
           */
          "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm md:h-9 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
