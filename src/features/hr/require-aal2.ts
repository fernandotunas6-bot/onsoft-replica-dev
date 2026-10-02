/**
 * Acções que mexem em dinheiro exigem 2FA nesta sessão (aal2).
 *
 * A base também o exige nas tabelas da folha, contratos e pagamentos
 * (20260930190000): sem aal2, um UPDATE não dá erro, simplesmente não altera
 * nenhuma linha. Esta verificação antes da chamada é o que dá ao utilizador a
 * razão, em vez de uma aprovação que não aconteceu. A mensagem contém «2FA»,
 * por isso o ecrã mostra o aviso com «Activar 2FA».
 */
export function requireAal2(claims: Record<string, unknown>, action: string) {
  if (claims["aal"] !== "aal2") {
    throw new Error(`${action} exige 2FA activo nesta sessão.`);
  }
}
