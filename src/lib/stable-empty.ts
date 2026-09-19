/**
 * Lista vazia partilhada, com identidade estável.
 *
 * O padrão `const { data: linhas = [] } = useQuery(...)` parece inofensivo mas
 * cria um array **novo a cada render** enquanto `data` for `undefined` — o que
 * acontece sempre que a query está desactivada (`enabled: false`), a carregar
 * ou em erro. Se esse valor entrar num array de dependências de `useMemo` ou
 * `useEffect`, a dependência muda em todos os renders; se o efeito ainda
 * chamar um `setState` com uma estrutura nova, o componente entra em ciclo
 * infinito de render e passa a queimar CPU sem nunca estabilizar.
 *
 * Usar `?? EMPTY_LIST` em vez do valor por omissão da desestruturação mantém a
 * identidade estável e o efeito só corre quando os dados mudam mesmo.
 *
 * `tests/lib/stable-query-defaults.test.ts` impede o padrão de voltar.
 */
export const EMPTY_LIST: never[] = Object.freeze([]) as never[];
