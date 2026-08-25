/** Imprime o documento HTML oficial diretamente através de um iframe oculto no DOM, sem abrir abas about:blank. */
export function printOfficialHtml(html: string) {
  // Garantir que existe um iframe de impressão isolado no DOM
  let iframe = document.getElementById("siga-print-frame") as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
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
