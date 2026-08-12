import { cn } from "@/lib/utils";

/** Círculo de avatar com foto (quando existe) e iniciais como reserva. */
export function UserAvatar({
  url,
  initials,
  className,
}: {
  url?: string | null;
  initials: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials}
    </span>
  );
}
