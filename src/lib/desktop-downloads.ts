import { toast } from "@/lib/toast";
import { openExternalLink } from "@/lib/desktop-utils";

/** Blobs lembrados de cada vez; os mais antigos saem (pré-visualizações nunca revogadas). */
const MAX_TRACKED_BLOBS = 40;

/** O mesmo limite do comando Rust `save_file`. */
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;

/**
 * Exportações na app desktop (Tauri).
 *
 * O SIGA exporta criando um `<a download href="blob:…">` e clicando-o (CSV, XLSX, jsPDF,
 * ICS…). O WKWebView (macOS) e o WebKitGTK (Linux) ignoram esse download: o botão
 * "Exportar" não fazia nada. Na app, esse clique passa a abrir o diálogo nativo
 * "Guardar como" (comando Rust `save_file`, que escolhe e escreve o ficheiro).
 *
 * Os `Blob` são guardados quando o URL é criado: o CSV revoga o URL logo a seguir ao
 * clique, e o jsPDF clica num `<a>` que nem está no documento.
 */

export function fileNameFromAnchor(anchor: HTMLAnchorElement) {
  const attr = anchor.getAttribute("download")?.trim();
  if (attr) return attr;
  try {
    const last = new URL(anchor.href).pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // href relativo ou inválido: usa o nome genérico.
  }
  return "exportacao-siga";
}

export async function saveBlobNative(blob: Blob, fileName: string) {
  if (blob.size > MAX_SAVE_BYTES) {
    throw new Error("O ficheiro passa de 50 MB e não pode ser guardado pela app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const saved = await invoke<string | null>("save_file", bytes, {
    headers: { "x-file-name": encodeURIComponent(fileName) },
  });
  if (saved) toast.success("Ficheiro guardado", { description: saved });
  return saved;
}

export function installDesktopDownloads() {
  const blobs = new Map<string, Blob>();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalClick = HTMLAnchorElement.prototype.click;
  const originalDispatch = HTMLAnchorElement.prototype.dispatchEvent;

  URL.createObjectURL = (object: Blob | MediaSource) => {
    const url = originalCreate(object);
    if (object instanceof Blob) {
      blobs.set(url, object);
      if (blobs.size > MAX_TRACKED_BLOBS) blobs.delete(blobs.keys().next().value as string);
    }
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    blobs.delete(url);
    originalRevoke(url);
  };

  /** Trata o download se for um; devolve `true` quando o fez. */
  const handle = (anchor: HTMLAnchorElement) => {
    if (!anchor.hasAttribute("download") || !anchor.href) return false;
    const name = fileNameFromAnchor(anchor);
    const href = anchor.href;
    // Lido já, de forma síncrona: o URL pode ser revogado na linha seguinte.
    const known = blobs.get(href);
    const blob: Promise<Blob> = known
      ? Promise.resolve(known)
      : fetch(href).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.blob();
        });
    void blob
      .then((value) => saveBlobNative(value, name))
      .catch((error) => {
        console.warn("[desktop] exportação falhou", error);
        // Ficheiro noutro servidor que não deixa ler (CORS): o browser do sistema descarrega.
        if (!known && /^https?:/i.test(href)) {
          void openExternalLink(href);
          return;
        }
        toast.error("Não foi possível guardar o ficheiro.", {
          description: error instanceof Error ? error.message : undefined,
        });
      });
    return true;
  };

  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    if (handle(this)) return;
    originalClick.call(this);
  };
  HTMLAnchorElement.prototype.dispatchEvent = function dispatchEvent(
    this: HTMLAnchorElement,
    event: Event,
  ) {
    if (event.type === "click" && handle(this)) return false;
    return originalDispatch.call(this, event);
  };

  // Cliques reais em links com `download` já desenhados na página.
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = (event.target as Element | null)?.closest?.("a[download]");
    if (anchor instanceof HTMLAnchorElement && handle(anchor)) event.preventDefault();
  };
  document.addEventListener("click", onClick, true);

  return () => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    HTMLAnchorElement.prototype.click = originalClick;
    HTMLAnchorElement.prototype.dispatchEvent = originalDispatch;
    document.removeEventListener("click", onClick, true);
    blobs.clear();
  };
}
