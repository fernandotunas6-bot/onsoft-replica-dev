import { useEffect, useState } from "react";
import { FileCover } from "./FileCover";
import { isImageFileKind, resolveFileUrl } from "./resolve-file";
import type { SchoolFileRecord } from "./schemas";

/** Capa com miniatura real para imagens raster; SVG e docs mantêm o ícone do tipo. */
export function FileCoverTile({
  file,
  selected,
  className,
}: {
  file: SchoolFileRecord;
  selected?: boolean;
  className?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImageFileKind(file.kind)) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void resolveFileUrl(file)
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url.startsWith("blob:") ? url : null;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.kind, file.storageBackend, file.storagePath]);

  return (
    <FileCover
      kind={file.kind}
      name={file.name}
      selected={selected}
      previewUrl={previewUrl}
      className={className}
    />
  );
}
