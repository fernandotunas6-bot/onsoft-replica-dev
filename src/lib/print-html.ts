import { isTauriDesktop } from "@/lib/desktop-utils";

/** Imprime o documento HTML oficial diretamente através de um iframe oculto no DOM, sem abrir abas about:blank. */
export function printOfficialHtml(html: string) {
  // App desktop no macOS: o WKWebView não imprime a partir de um iframe. O Rust abre
  // uma janela de pré-visualização servida com `script-src 'none'` (os modelos são
  // editáveis pela escola) e mostra o diálogo de impressão nativo.
  if (isTauriDesktop() && /Mac/i.test(navigator.userAgent)) {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("print_html", { html }))
      .catch((error) => console.warn("[desktop] impressão falhou", error));
    return;
  }

  // Garantir que existe um iframe de impressão isolado no DOM
  let iframe = document.getElementById("siga-print-frame") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    // Os modelos de impressão são editáveis pela escola. Sem `allow-scripts`,
    // nenhum script do documento corre (um <script> num modelo roubava a
    // sessão de quem imprimisse). `allow-same-origin` deixa escrever e chamar
    // print() daqui; `allow-modals` deixa abrir o diálogo de impressão.
    iframe.setAttribute("sandbox", "allow-same-origin allow-modals");
    iframe.id = "siga-print-frame";
    iframe.style.position = "fixed";
    iframe.style.right = "-9999px";
    iframe.style.bottom = "-9999px";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
  }

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    throw new Error("Não foi possível aceder ao motor de impressão.");
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  const doPrint = () => {
    try {
      iframe?.contentWindow?.focus();
      iframe?.contentWindow?.print();
    } catch {
      /* fallback se o utilitário de impressão falhar */
    }
  };

  if (iframeDoc.readyState === "complete") {
    setTimeout(doPrint, 250);
  } else {
    iframe.onload = () => setTimeout(doPrint, 250);
  }
}
