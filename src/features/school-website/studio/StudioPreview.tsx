import { memo, useEffect, useState } from "react";
import type { WebsiteDraft } from "../content-model";
import { loadWebsitePreviewWordmark, websiteDraftPreview } from "../website-preview";

/** Slow HTML work is debounced; untrusted template content stays inside a scriptless sandbox. */
export const StudioPreview = memo(function StudioPreview({
  draft,
  path,
  schoolName,
  logoUrl,
  width,
  zoom,
}: {
  draft: WebsiteDraft;
  path: string;
  schoolName: string;
  logoUrl?: string | null;
  width: number;
  zoom: number;
}) {
  const [html, setHtml] = useState("");
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
        setHtml(
          websiteDraftPreview(draft, path, schoolName, window.location.origin, logoUrl, wordmark),
        );
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Pré-visualização indisponível.");
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draft, path, schoolName, logoUrl, wordmark]);
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
            sandbox=""
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
