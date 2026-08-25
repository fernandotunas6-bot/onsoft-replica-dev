# SIGA — Pauta Final e Mini Pauta (Angola)

Módulo de referência para integrar pautas angolanas no SIGA.

## Conteúdo

- `src/components/FinalPauta.tsx` — Pauta Final React/TypeScript.
- `src/components/MiniPauta.tsx` — Mini Pauta React/TypeScript.
- `src/lib/assessment.ts` — regras de validação e cálculo isoladas da UI.
- `src/lib/assessment.test.ts` — testes dos cálculos principais.
- `html/pauta-final.html` — template HTML autónomo.
- `html/mini-pauta.html` — template HTML autónomo.

## Perfil de cálculo padrão

O projeto usa como perfil padrão para **classes de transição** o Decreto Executivo n.º 424/25, de 18 de junho de 2025:

- `MT = (MACT + NPT) / 2`
- `MFD = (MT1 + MT2 + MT3) / 3`

O campo `NPP` é mostrado na Mini Pauta somente para compatibilidade visual com modelos escolares anteriores encontrados em Angola. Ele não participa do cálculo padrão 424/25.

## Decisões importantes para reduzir erros

1. A escala é validada entre `0` e `20`.
2. Nota ausente permanece vazia; nunca é transformada automaticamente em zero.
3. O template não decide sozinho `TRANSITA`, `REPROVADO`, `APTO`, etc. O resultado deve vir do motor pedagógico do SIGA conforme classe, regime, exames, faltas e regras vigentes.
4. Resultados negativos são destacados em vermelho na pauta eletrónica.
5. Os cálculos ficam fora dos componentes visuais, permitindo testes e reutilização no backend.
6. As disciplinas da Pauta Final são dinâmicas; a grelha acompanha o currículo da turma.
7. Os modelos foram preparados para impressão: Pauta Final em A3 paisagem e Mini Pauta em A4 paisagem.

## Integração no SIGA

Passe objetos compatíveis com `FinalPautaDocument` e `MiniPautaDocument` vindos da API/Supabase. Evite recalcular médias em vários lugares; centralize o cálculo no serviço pedagógico e use os helpers do frontend apenas como validação/apresentação.

## Executar

```bash
npm install
npm run dev
```

## Testar

```bash
npm test
```

## Referências normativas/práticas consultadas

- Decreto Executivo n.º 424/25, de 18 de junho — Regulamento da Avaliação das Aprendizagens.
- Modelos escolares angolanos de Pauta Final com MT1, MT2, MT3 e MFD.
- Modelos de Mini Pauta angolanos com blocos trimestrais e observações.

> Antes de produção, o SIGA deve parametrizar os perfis de avaliação por nível/classe e não assumir que todas as classes seguem exatamente o mesmo regime, sobretudo classes com exame nacional/combinado.
