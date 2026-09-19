import { useEffect, useState } from "react";
import { FileCover } from "./FileCover";
import { isImageFileKind, resolveFileUrl } from "./resolve-file";
import type { SchoolFileRecord } from "./schemas";

/**
 * Capa com miniatura real para imagens raster; SVG e docs mantêm o ícone do tipo.
 * Quando `resolvedPreviewUrl` é dado (grelha em lote, ver FileBrowser), usa-o
 * directamente em vez de assinar a própria miniatura — evita 1 pedido por capa.
 */
export function FileCoverTile({
  file,
  selected,
  className,
  resolvedPreviewUrl,
  locked,
}: {
  file: SchoolFileRecord;
  selected?: boolean;
  className?: string;
  resolvedPreviewUrl?: string | null | undefined;
  locked?: boolean;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const batched = resolvedPreviewUrl !== undefined;

  useEffect(() => {
    if (batched || locked) {
      if (locked) setPreviewUrl(null);
      return;
    }
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
    // De propósito: os campos usados em vez do objecto `file`, cuja identidade
    // muda a cada render e reexecutaria o efeito (revogando o blob) sem
    // necessidade nenhuma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batched, file.id, file.kind, file.storageBackend, file.storagePath, locked]);

  return (
    <FileCover
      kind={file.kind}
      name={file.name}
      selected={selected}
      previewUrl={locked ? null : batched ? resolvedPreviewUrl : previewUrl}
      locked={locked}
      className={className}
    />
  );
}
