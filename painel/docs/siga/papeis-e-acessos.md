# Papéis, acessos e segurança

Cada conta tem um papel em cada escola. O papel decide o que a pessoa vê no menu e o que o servidor aceita. Esconder um botão não é a protecção: o servidor volta a verificar tudo.

## Papéis

| Papel         | O que faz no dia-a-dia                                              |
| ------------- | ------------------------------------------------------------------- |
| Administrador | Tudo na escola, incluindo Definições, RH e acessos                  |
| Secretaria    | Alunos, pessoas, documentos, pedagógica, matrículas e acessos       |
| Tesouraria    | Financeiro, facturas, caixa, relatórios financeiros e RH            |
| Professor     | As suas turmas, notas, chamada, planos de aula e presença por QR    |
| Encarregado   | Portal com notas, frequência, calendário e financeiro dos educandos |
| Aluno         | Portal com turma, horário, notas, frequência e financeiro           |

## Permissões por módulo

Em **Acessos**, o Administrador pode ajustar cada módulo para uma pessoa com um de quatro níveis: **Nenhum**, **Leitura**, **Escrita** ou **Total**.

- A permissão pode alargar o acesso da Secretaria, da Tesouraria e do Professor. Por exemplo, dar Financeiro a um Professor.
- Em alunos e encarregados a permissão só retira acesso. Nunca o alarga.
- RH, folha salarial e Definições abrem só pelo papel, nunca por permissão.
- Os papéis Tesouraria e Administrador só podem ser atribuídos por um Administrador.

## Convites e pedidos de acesso

- **Convidar:** em Acessos, crie o convite com o e-mail e o papel. A pessoa recebe o link e define a senha.
- **Pedido de acesso:** quem já tem conta pode pedir para entrar noutra escola. O pedido fica na fila de Acessos até ser aprovado ou recusado.
- **Reenviar:** se o convite se perdeu, use Reenviar na linha da conta.

## Verificação em dois passos

A verificação em dois passos usa uma aplicação autenticadora, como o Google Authenticator. Activa-se em **Definições → Segurança**.

Algumas acções exigem sessão com dois passos, porque mexem em dinheiro ou em documentos oficiais:

- emitir e estornar recibos, despesas e planos de pagamento;
- gerar e mudar o estado das pautas oficiais;
- folha salarial e lotes de pagamento;
- redefinir a senha de um funcionário;
- ver ou rodar a chave do gateway de pagamentos.

Sem dois passos activos, o SIGA mostra o aviso com o botão **Activar 2FA**. Recomenda-se activar em todas as contas de Administrador e Tesouraria.

## Entrar no SIGA

- Com e-mail e senha, com o número do BI e senha, ou com link mágico por e-mail.
- Se a senha aparecer em fugas de dados conhecidas, o SIGA avisa e pede para a mudar.
- Em computadores partilhados, termine sempre a sessão: o SIGA limpa os dados guardados no browser.
