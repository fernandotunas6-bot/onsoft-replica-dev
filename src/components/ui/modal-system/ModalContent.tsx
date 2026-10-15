import * as React from "react";
import { cn } from "@/lib/utils";

export interface ModalContentProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function ModalContent({ children, className, noPadding = false }: ModalContentProps) {
  return (
    <div
      className={cn(
        "flex-1 overflow-y-auto max-h-[calc(85vh-110px)] focus:outline-hidden",
        !noPadding && "p-5 space-y-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
