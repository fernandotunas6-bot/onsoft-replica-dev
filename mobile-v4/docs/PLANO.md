# Análise e plano — 09/10/2026

## Base recebida

HTML único com CSS e JavaScript inline. Já funciona: landing, quatro separadores, painéis inferiores, temas, três gradientes animados, SVGs, selector escolar vazio, listas de projectos/conversas em memória e acções locais parciais. O separador Meu dia apresenta 16 atalhos distribuídos por professor/aluno, mas os detalhes são demonstrativos. Não há ZIP anexado nesta mensagem.

Lacunas: sem módulos académicos funcionais, sem sessão real ou permissões efectivas, sem backend/persistência/testes/PWA. Renderização por innerHTML e handlers inline torna a evolução e o tratamento de texto menos seguros. O estado não é um contrato tipado.

## Plano e estado

| Fase | Entrega                                                                    | Estado                                                         |
| ---- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1    | Pasta `mobile-v4/`, fonte intacta, análise e plano                         | Concluído nesta implementação                                  |
| 2    | React + TS com CSS/SVG originais e componentes                             | Concluído; revisão visual real pendente                        |
| 3    | Chamada, notas, plano, tarefas, entrega, mensagens e pedidos de documentos | Funcional no serviço de teste                                  |
| 4    | Adaptador de sessão, escolas e dados SIGA                                  | Contrato e cliente preparados; servidor por implementar/mapear |
| 5    | Permissões por vínculo, turma e aluno, descarte de respostas atrasadas     | Testado localmente; enforcement servidor pendente              |
| 6    | Manifesto, ícones e cache do shell; testes e build                         | Implementado; instalação em dispositivo por verificar          |
| 7    | Validação autenticada em staging e revisão mobile                          | Pendente                                                       |
| 8    | Integração/publicação na produção                                          | Não autorizada neste pedido                                    |

## Próxima sequência

1. Mapear serviços actuais de `features/auth`, `features/access`, `features/academic`, portais professor/aluno e documentos. Reutilizar regras, matrículas, horários e períodos existentes; não duplicar a verdade académica.
2. Expor contrato HTTP em branch de integração, com os guards reais do SIGA e sem migrações automáticas. Validar sessão/MFA, vínculos activos, grants e turma/disciplinas do professor no servidor.
3. Ligar `ApiGateway` apenas num ambiente isolado, mantendo DemoGateway claramente separado. Validar cargas, erros 401/403/409/422 e estados vazios/offline.
4. Testes reais com duas escolas e perfis docente/aluno: IDs trocados, URLs directas, sessão revogada, nota não publicada, período fechado, conflitos e histórico de auditoria.
5. QA 320/360/390/430/768 px, Android/iOS, modo escuro, redução de movimento, teclado, zoom 200%, leitores de ecrã e instalação/offline da PWA.
6. Só após estes gates, preparar proposta concreta de integração/publicação para aprovação.

## Riscos prioritários

- Alto: isolamento e grants no servidor ainda não ligados. Não activar o adaptador de produção com base em listas do cliente.
- Alto: notas reais requerem períodos, composição de avaliação, publicação, conflitos e auditoria canónicos. O campo 0–20 da demo não substitui o AssessmentCenter.
- Médio: uploads, documentos oficiais e pedidos de vínculo aguardam serviços existentes; não inventar sucesso.
- Médio: gradientes e backdrop-filter precisam de teste em dispositivos de baixa potência; animações respeitam reduced-motion.
- Médio: shell PWA disponível offline não significa dados académicos disponíveis offline.
