# Candidatura e contactos — refinamento dos percursos locais

Data: 20 de Outubro de 2026. Website demonstrativo ISPAB. Sem alterações de desenho, páginas, backend, autenticação ou contrato da API.

## Antes e depois

| Caso reproduzido | Antes | Depois |
| --- | --- | --- |
| Guardar rascunho no passo 2 e retomar | Voltava ao passo 1 | Retoma a etapa guardada, com foco no título; valida os passos anteriores antes de avançar |
| Rascunho antigo ou com dados incompletos | Sempre recomeçava no passo 1 | Rascunhos antigos mantêm compatibilidade; dados inválidos levam à primeira etapa que precisa de correcção |
| Confirmação da demonstração | Podia permanecer assinalada após alterar dados | Não é guardada no rascunho; alterações aos dados exigem nova confirmação |
| Dados de uma etapa anterior alterados antes da conclusão | A conclusão apenas verificava que nome, e-mail e província não estavam vazios | Revalida os campos das etapas anteriores e mostra a etapa e o campo inválidos |
| Editar um registo apagado noutro separador | Criava uma nova referência local | Informa que o registo foi apagado e não o recria |
| Link com assunto Propinas e custos | Assunto ficava vazio | Mantém o assunto no select e no ficheiro de mensagem; texto tratado como texto, sem executar HTML |

O rascunho continua a ser guardado apenas por acção explícita. A retoma não preenche a confirmação final. A edição mantém a referência e a data de criação do registo existente. A conclusão evita duplicação por novos eventos de submit depois de guardar. A falta de espaço ou bloqueio do armazenamento não mostra sucesso; permite corrigir o problema e repetir.

Assuntos vindos dos links são limitados a 100 caracteres e não aceitam caracteres de controlo. Não há envio de e-mail: o formulário continua a descarregar uma mensagem de texto no dispositivo.

## Validação local

- Browser Chromium: rascunho parcial no passo 2, rascunho no passo 3, foco, dados inválidos e compatibilidade com o formato antigo.
- Confirmação obrigatória, nova confirmação após edição e revalidação de um e-mail inválido numa etapa anterior.
- Conclusão, descarga do resumo demonstrativo, preservação da referência na edição e bloqueio de duplicação.
- Dois separadores: um apaga o registo enquanto o outro o edita; o editor não recria o registo.
- Armazenamento bloqueado: não apresenta sucesso; repetição após reposição guarda um único registo.
- Contactos: assuntos dos guias, texto semelhante a HTML e assunto correcto no ficheiro descarregado.
- Verificação das 65 páginas em 320, 768, 1024 e 1440 px, sem erros de JavaScript ou transbordamento horizontal.
- Build e verificação de páginas, ligações e metadados nos dois projectos; saída estática equivalente; sete testes do cliente da API aprovados.

Nenhum destes fluxos constitui candidatura oficial, pagamento ou comunicação institucional. A API continua pendente da configuração de URL e campanha reais, conforme a documentação de integração.
