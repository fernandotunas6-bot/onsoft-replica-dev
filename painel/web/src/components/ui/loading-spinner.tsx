"use client"

import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
  label?: string
  fullScreen?: boolean
}

export function LoadingSpinner({
  className,
  size = "md",
  label = "A carregar…",
  fullScreen = false,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground",
        fullScreen ? "min-h-screen" : "min-h-[50vh]",
        className
      )}
    >
      <div
        className={cn(
          "animate-spin rounded-full border-b-2 border-primary",
          sizeClasses[size]
        )}
      />
      {label && <p className="text-sm font-medium">{label}</p>}
    </div>
  )
}
