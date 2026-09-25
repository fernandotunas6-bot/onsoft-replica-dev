import { DotPattern } from "@/components/dot-pattern"
import { cn } from "@/lib/utils"

interface MarketingPageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  className?: string
  centered?: boolean
}

export function MarketingPageHeader({
  title,
  description,
  eyebrow,
  className,
  centered = true,
}: MarketingPageHeaderProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border-b bg-gradient-to-b from-background to-muted/30 py-12 sm:py-16",
        className,
      )}
    >
      <div className="absolute inset-0">
        <DotPattern className="opacity-60" size="md" fadeStyle="ellipse" />
      </div>
      <div
        className={cn(
          "container relative mx-auto px-4 sm:px-6 lg:px-8",
          centered && "mx-auto max-w-3xl text-center",
        )}
      >
        {eyebrow ? (
          <p className="mb-3 text-sm font-medium text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
        {description ? (
          <p className="mt-4 text-lg text-muted-foreground sm:text-xl">{description}</p>
        ) : null}
      </div>
    </section>
  )
}
