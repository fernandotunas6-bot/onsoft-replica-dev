# Área do candidato — foco e actualizações locais

20 de Outubro de 2026. Mesmos percursos, conteúdos e visual do ISPAB. Sem integração adicional ou submissão institucional.

Ao apagar uma candidatura local, a lista era reconstruída e perdia o foco. Agora mantém a acção no registo correspondente ou passa para o registo seguinte/anterior. Quando a lista fica vazia, o foco vai para o link de candidatura. A eliminação de rascunhos segue o mesmo princípio.

Se a lista mudar noutro separador enquanto um resumo ou confirmação está aberto, a janela mantém o foco. Ao fechá-la, o foco regressa a uma acção disponível, mesmo que o botão que a abriu tenha sido removido. As actualizações com a janela fechada mantêm a acção seleccionada na candidatura correspondente.

Os botões de resumo, download, edição e eliminação têm rótulos acessíveis com a referência local, para distinguir candidaturas sem mudar o texto visual.

Verificação no Chromium:

- Apagar no meio, no fim e o último registo, com confirmação e cancelamento, nas páginas pública e do portal.
- Janela aberta enquanto outro separador apaga o registo ou limpa o armazenamento; foco mantido dentro da janela e devolvido correctamente após Escape ou o botão Fechar.
- Eliminação de rascunho e foco no estado vazio.
- Acção de download focada enquanto outro separador altera a lista.
- 65 páginas em 320, 768, 1024 e 1440 px sem erros de JavaScript ou transbordamento horizontal.
- Build, verificação de recursos/calendário e sete testes do cliente nos dois projectos; saída estática equivalente à prévia.

Testes locais de navegação; não constituem uma auditoria formal com leitores de ecrã. As candidaturas continuam demonstrativas e guardadas apenas no navegador.
