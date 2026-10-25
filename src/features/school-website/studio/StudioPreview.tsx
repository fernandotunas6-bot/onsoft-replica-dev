import { memo, useEffect, useRef, useState } from "react";
import type { WebsiteDraft, WebsiteField } from "../content-model";
import { selectablePreview, selectedPreviewKeys } from "./selection";
import { loadWebsitePreviewWordmark, websiteDraftPreview } from "../website-preview";

const emptyFields: readonly WebsiteField[] = [];

/** Debounced HTML; selection grants only a nonce-pinned bridge in an opaque sandbox. */
export const StudioPreview = memo(function StudioPreview({
  draft,
  path,
  schoolName,
  logoUrl,
  width,
  zoom,
  selecting = false,
  fields = emptyFields,
  onSelect,
}: {
  draft: WebsiteDraft;
  path: string;
  schoolName: string;
  logoUrl?: string | null;
  width: number;
  zoom: number;
  selecting?: boolean;
  fields?: readonly WebsiteField[];
  onSelect?: (keys: string[]) => void;
}) {
  const [document, setDocument] = useState({ html: "", channel: "" });
  const frame = useRef<HTMLIFrameElement>(null);
  const html = document.html;
  useEffect(() => {
    if (!selecting || !document.channel || !onSelect) return;
    const receive = (event: MessageEvent) => {
      const keys = selectedPreviewKeys(
        event,
        frame.current?.contentWindow ?? null,
        document.channel,
        fields,
      );
      if (keys) onSelect(keys);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [selecting, document.channel, fields, onSelect]);
  const [error, setError] = useState("");
  const [wordmark, setWordmark] = useState<string | null>(null);
  useEffect(() => {
    if (!/^ISPAB/i.test(schoolName) || logoUrl) return;
    let active = true;
    void loadWebsitePreviewWordmark(window.location.origin).then((url) => {
      if (active) setWordmark(url);
    });
    return () => {
      active = false;
    };
  }, [schoolName, logoUrl]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const source = websiteDraftPreview(
          draft,
          path,
          schoolName,
          window.location.origin,
          logoUrl,
          wordmark,
        );
        setDocument(
          selecting
            ? selectablePreview(source, fields, window.location.origin)
            : { html: source, channel: "" },
        );
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Pré-visualização indisponível.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft, path, schoolName, logoUrl, wordmark, selecting, fields]);
  return (
    <div className="studio-preview-document">
      {error && (
        <p role="alert" className="studio-preview-error">
          {error} A última prévia válida pode continuar visível.
        </p>
      )}
      {!html && <p role="status">A preparar pré-visualização…</p>}
      {html && (
        <div style={{ width: (width * zoom) / 100, height: (940 * zoom) / 100 }}>
          <iframe
            title={`Pré-visualização privada · ${schoolName} · ${path}`}
            ref={frame}
            sandbox={selecting ? "allow-scripts" : ""}
            referrerPolicy="no-referrer"
            srcDoc={html}
            style={{
              width,
              height: 940,
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top left",
            }}
          />
        </div>
      )}
    </div>
  );
});
