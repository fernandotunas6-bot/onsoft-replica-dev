import { cn } from "@/lib/utils"

interface MarketingAuthShellProps {
  children: React.ReactNode
  className?: string
  maxWidth?: "sm" | "md" | "lg"
}

const widthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
} as const

/** Área centrada para wizard, login e erros — dentro do MarketingLayout. */
export function MarketingAuthShell({
  children,
  className,
  maxWidth = "md",
}: MarketingAuthShellProps) {
  return (
    <div
      className={cn(
        "container mx-auto flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8",
        className,
      )}
    >
      <div className={cn("flex w-full flex-col gap-6", widthClass[maxWidth])}>{children}</div>
    </div>
  )
}
