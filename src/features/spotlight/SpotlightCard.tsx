import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { IconChip } from "@/components/ui/icon-chip";
import type { ChipTone } from "@/components/ui/icon-chip";
import { spotlightIcon } from "./icons";
import type { SpotlightItem, SpotlightTone } from "./schemas";

const wash: Record<SpotlightTone, string> = {
  primary: "bg-primary-soft",
  info: "bg-info/15",
  success: "bg-success/14",
  warning: "bg-warning/16",
};

const titleTone: Record<SpotlightTone, string> = {
  primary: "text-primary",
  info: "text-info-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
};

const bodyTone: Record<SpotlightTone, string> = {
  primary: "text-primary/80",
  info: "text-info-strong/80",
  success: "text-success-strong/80",
  warning: "text-warning-strong/80",
};

const buttonTone: Record<SpotlightTone, string> = {
  primary: "bg-primary text-primary-foreground",
  info: "bg-info text-info-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
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
  const Icon = spotlightIcon(item.icon);
  const ctaClass = `mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 ${buttonTone[item.tone]}`;

  let action: ReactNode = <span className={ctaClass}>{item.cta}</span>;
  if (item.link.type === "external") {
    action = (
      <a
        href={item.link.href}
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

  return (
    <div className={`overflow-hidden rounded-2xl p-4 ${wash[item.tone]}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${titleTone[item.tone]}`}>{item.title}</p>
          <p className={`mt-0.5 text-xs ${bodyTone[item.tone]}`}>{item.body}</p>
          {action}
        </div>
        <IconChip icon={Icon} tone={chipTone[item.tone]} size="md" label={item.title} />
      </div>
    </div>
  );
}
