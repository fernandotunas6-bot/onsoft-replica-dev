/**
 * Senhas expostas em fugas de dados, verificadas no navegador.
 *
 * O Supabase só faz esta verificação no plano Pro. No plano gratuito a
 * aplicação consulta ela própria a API pública do HaveIBeenPwned
 * (https://haveibeenpwned.com/API/v3#PwnedPasswords), sem chave, com
 * k-anonimato: só saem do navegador os 5 primeiros caracteres do SHA-1 da
 * senha, e a comparação com os sufixos devolvidos é feita aqui. Nem a senha
 * nem o hash completo são enviados. É um GET simples, sem cabeçalhos próprios
 * (o `Add-Padding` obrigaria a um pedido prévio de CORS que, recusado, calaria
 * a verificação sem aviso).
 *
 * Falha aberta: se a API não responder (rede, bloqueio, tempo esgotado), o
 * resultado é `null` e o formulário segue. É uma ajuda à pessoa que escolhe a
 * senha, não uma barreira de segurança: quem a quiser contornar escolhe a
 * senha que quiser na mesma.
 */

const RANGE_URL = "https://api.pwnedpasswords.com/range/";

export async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Contagem do sufixo numa resposta `SUFIXO:CONTAGEM` por linha (0 se não estiver). */
export function countInRange(body: string, suffix: string): number {
  const target = suffix.toUpperCase();
  for (const line of body.split(/\r?\n/)) {
    const [candidate, count] = line.trim().split(":");
    if (candidate?.toUpperCase() === target) {
      const n = Number.parseInt(count ?? "", 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

/**
 * Quantas vezes a senha aparece em fugas conhecidas: 0 se nunca, `null` se
 * não foi possível verificar.
 */
export async function passwordExposureCount(
  password: string,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<number | null> {
  if (!password) return null;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function" || !globalThis.crypto?.subtle) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
  try {
    const hash = await sha1Hex(password);
    const response = await fetchImpl(`${RANGE_URL}${hash.slice(0, 5)}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return countInRange(await response.text(), hash.slice(5));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
