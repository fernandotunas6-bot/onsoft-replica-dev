/** Abre o documento HTML oficial numa janela própria e inicia a impressão. */
export function printOfficialHtml(html: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=1100");
  if (!popup) {
    throw new Error("Permita janelas pop-up para pré-visualizar ou imprimir o modelo.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  const trigger = () => {
    try {
      popup.print();
    } catch {
      /* o utilizador pode imprimir manualmente */
    }
  };
  if (popup.document.readyState === "complete") {
    window.setTimeout(trigger, 250);
  } else {
    popup.addEventListener("load", trigger, { once: true });
  }
}
