import { useEffect, useState } from "react";
import { resolvePersonPhotoUrl } from "@/features/arquivos/person-photo-url";
import { cn } from "@/lib/utils";

function useAvatarUrl(url?: string | null) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(url ?? null);

  useEffect(() => {
    let active = true;
    setResolvedUrl(null);
    void resolvePersonPhotoUrl(url).then((result) => {
      if (active) setResolvedUrl(result);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return resolvedUrl;
}

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
  const resolvedUrl = useAvatarUrl(url);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
    >
      {resolvedUrl ? <img src={resolvedUrl} alt="" className="size-full object-cover" /> : initials}
    </span>
  );
}
