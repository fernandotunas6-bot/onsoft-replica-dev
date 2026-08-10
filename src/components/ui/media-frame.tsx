import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimals-style image handling: rounded frame, fixed ratio, shimmer placeholder,
 * native lazy loading + async decoding so touch interactions never block.
 */
export function MediaFrame({
  src,
  alt,
  ratio = "16/9",
  rounded = "rounded-2xl",
  className,
  imgClassName,
  overlay = false,
  priority = false,
  children,
}: {
  src: string;
  alt: string;
  ratio?: string;
  rounded?: string;
  className?: string;
  imgClassName?: string;
  overlay?: boolean;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      data-media-frame=""
      className={cn("relative overflow-hidden bg-muted", rounded, className)}
      style={{ aspectRatio: ratio }}
    >
      {!loaded ? <span className="absolute inset-0 animate-pulse bg-muted" /> : null}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        className={cn(
          "size-full object-cover transition-[opacity,transform] duration-300 will-change-transform",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
      {overlay ? (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-foreground/55 via-foreground/10 to-transparent" />
      ) : null}
      {children ? <div className="absolute inset-0">{children}</div> : null}
    </div>
  );
}

/**
 * Small rounded avatar/thumbnail with the same loading behaviour.
 * Without `src` it falls back to soft-tinted initials (Minimals style),
 * using only existing design tokens.
 */
export function MediaAvatar({
  src,
  alt,
  fallback,
  className,
  textClassName,
}: {
  src?: string | null;
  alt: string;
  fallback?: string;
  className?: string;
  textClassName?: string;
}) {
  const initials = (fallback ?? alt)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  if (!src) {
    return (
      <span
        aria-label={alt}
        role="img"
        data-media-frame=""
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-xs font-extrabold text-primary",
          className,
          textClassName,
        )}
      >
        {initials}
      </span>
    );
  }

  return (
    <MediaFrame
      src={src}
      alt={alt}
      ratio="1/1"
      rounded="rounded-full"
      className={cn("size-10 shrink-0", className)}
    />
  );
}
