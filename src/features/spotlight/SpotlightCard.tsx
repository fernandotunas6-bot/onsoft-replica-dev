import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { IconChip } from "@/components/ui/icon-chip";
import { LogoChip } from "@/components/ui/logo-chip";
import type { ChipTone } from "@/components/ui/icon-chip";
import type { SpotlightItem, SpotlightTone } from "./schemas";
import { safeHref } from "@/lib/safe-url";

const wash: Record<SpotlightTone, string> = {
  primary: "bg-primary-soft/50",
  info: "bg-info/6",
  success: "bg-success/6",
  warning: "bg-warning/8",
};

const titleTone: Record<SpotlightTone, string> = {
  primary: "text-foreground",
  info: "text-foreground",
  success: "text-foreground",
  warning: "text-foreground",
};

const bodyTone: Record<SpotlightTone, string> = {
  primary: "text-muted-foreground",
  info: "text-muted-foreground",
  success: "text-muted-foreground",
  warning: "text-muted-foreground",
};

const buttonTone: Record<SpotlightTone, string> = {
  primary: "border border-primary/30 text-primary-strong",
  info: "border border-info/30 text-info-strong",
  success: "border border-success/30 text-success-strong",
  warning: "border border-warning/40 text-warning-strong",
};

const chipTone: Record<SpotlightTone, ChipTone> = {
  primary: "primary",
  info: "info",
  success: "success",
  warning: "warning",
};

export function SpotlightCard({
  item,
  href,
  onInternal,
  onSettings,
}: {
  item: SpotlightItem;
  href?: string;
  onInternal?: () => void;
  onSettings?: (panel: string) => void;
}) {
  const ctaClass = `mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-medium bg-background/60 transition-colors hover:bg-background ${buttonTone[item.tone]}`;

  let action: ReactNode = <span className={ctaClass}>{item.cta}</span>;
  if (item.link.type === "external") {
    action = (
      <a
        href={safeHref(item.link.href)}
        target="_blank"
        rel="noopener noreferrer"
        className={ctaClass}
      >
        {item.cta}
      </a>
    );
  } else if (item.link.type === "settings") {
    const panel = item.link.panel;
    action = (
      <button type="button" className={ctaClass} onClick={() => onSettings?.(panel)}>
        {item.cta}
      </button>
    );
  } else if (href) {
    action = (
      <Link to={href} onClick={onInternal} className={ctaClass}>
        {item.cta}
      </Link>
    );
  }

  const logoMark = item.logoUrl?.trim() ? (
    <LogoChip src={item.logoUrl.trim()} tone={chipTone[item.tone]} size="md" label={item.title} />
  ) : (
    <IconChip icon={Sparkles} tone={chipTone[item.tone]} size="md" label={item.title} />
  );

  return (
    <div className={`overflow-hidden rounded-2xl border border-border/60 p-4 ${wash[item.tone]}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${titleTone[item.tone]}`}>{item.title}</p>
          <p className={`mt-0.5 text-xs ${bodyTone[item.tone]}`}>{item.body}</p>
          {action}
        </div>
        {logoMark}
      </div>
    </div>
  );
}
