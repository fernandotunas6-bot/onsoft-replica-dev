/**
 * O seed é .mjs e não tem tipos próprios. Esta declaração existe para o teste
 * `tests/security/seed-demo-vs-producao.test.ts` o poder importar e correr com
 * um cliente-espelho — sem ela o `tsc` acusa TS7016 e a alternativa seria
 * silenciar o erro, que é pior: passaria a esconder uma mudança de assinatura.
 */
export declare function runSeed(): Promise<void>;
