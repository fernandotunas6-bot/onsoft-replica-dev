import { toast } from "@/lib/toast";

/**
 * Só depois de o servidor devolver um recibo: impressão/cache não são uma nova
 * liquidação. Falhar aqui não deve deixar o formulário a pedir outra cobrança.
 */
export async function finishRecordedPayment({
  receiptNumber,
  refresh,
  print,
}: {
  receiptNumber: string;
  refresh: () => unknown | PromiseLike<unknown>;
  print: () => unknown | PromiseLike<unknown>;
}) {
  const [updated, document] = await Promise.allSettled([
    Promise.resolve().then(refresh),
    Promise.resolve().then(print),
  ]);
  const messages: string[] = [];
  if (document.status === "rejected")
    messages.push("Não foi possível imprimir agora. Obtenha o recibo em Movimentos de Caixa.");
  if (updated.status === "rejected")
    messages.push("Actualize a lista para consultar o saldo mais recente.");
  if (messages.length)
    toast.warning(`Pagamento registado · ${receiptNumber}`, { description: messages.join(" ") });
}
