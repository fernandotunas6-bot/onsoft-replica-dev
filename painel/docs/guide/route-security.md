# Segurança de rotas e acessos

Como o SIGA Plus decide quem vê o quê. A protecção tem três camadas — o ecrã, o servidor e a
base de dados — e a que decide é sempre o servidor: esconder um botão não é segurança.

## Páginas sem conta

Abrem sem sessão iniciada:

- a **matrícula online** da escola (`/matricula/<escola>`) e o website escolar;
- a **verificação de documentos** (`/verificar`), para quem recebe um certificado;
- os **convites** (`/convite`) e as páginas de **senha** (`/auth/…`: recuperar, definir,
  confirmar o e-mail);
- **transferir a app** para computador (`/transferir`);
- o **calendário ICS**, por ligação privada de cada pessoa.

Todas as outras páginas pedem sessão iniciada.

## Entrar

- Entrada com e-mail, Nº de BI/NIF ou, nas escolas que o activam, o Nº de aluno; com
  Google; ou com uma ligação enviada por e-mail.
- **Verificação em dois passos (2FA):** a confirmação no início de sessão é uma escolha de
  cada conta. As acções críticas pedem uma nova confirmação de identidade (chave de acesso,
  código da aplicação autenticadora ou, numa conta sem 2FA, a senha). Numa conta com 2FA,
  mudar a senha pede sempre o segundo factor.
- **Escola com a assinatura suspensa:** só o Administrador da escola entra, para regularizar.

## Cargos e módulos

| Cargo | Para quê |
| --- | --- |
| **Administrador** | Toda a escola, incluindo as configurações |
| **Secretaria** | Pessoas, matrículas, turmas e documentos |
| **Tesouraria** | Faturas, caixa, pagamentos e relatórios financeiros |
| **Professor** | As suas turmas: aulas, presenças, avaliações e pautas |
| **Encarregado** | Os educandos: notas, faltas, pagamentos e comunicados |
| **Aluno** | O próprio percurso: horário, notas, trabalhos e pagamentos |

- Cada ecrã pertence a um módulo. Ao abrir um ecrã que o cargo não abre, o SIGA Plus diz
  porquê, em vez de mostrar uma página vazia.
- O Administrador pode dar a Secretaria, Tesouraria ou Professor **permissões por módulo**
  (por exemplo, o Financeiro a um professor). Alunos e encarregados nunca recebem permissões
  além do seu cargo.
- Algumas áreas abrem **só pelo cargo**, nunca por permissão: os Recursos Humanos e a folha
  salarial, e as configurações da escola (só o Administrador).
- Os módulos que o **plano** da escola não inclui não aparecem.

## No servidor

- Cada operação do servidor confirma a sessão e o cargo antes de ler ou gravar. As poucas
  que são públicas por natureza (a matrícula online, a verificação de documentos) têm
  defesas próprias, como limites de pedidos. Um teste automático impede que se publique uma
  operação nova sem guarda.
- As acções críticas só gravam depois da nova confirmação de identidade descrita acima.

## Na base de dados

- Todas as tabelas têm segurança ao nível da linha (RLS): os dados de uma escola nunca
  chegam a outra.
- Os dados de alunos, notas, faltas e pagamentos só abrem ao pessoal da própria escola com
  a permissão certa e, a cada aluno e encarregado, apenas os seus. As tabelas mais sensíveis
  só são acessíveis pelo servidor, depois das verificações acima.

## Consola da plataforma (ADMIN)

Só entra a equipa que administra a plataforma, sempre com verificação em dois passos. O
cargo de Administrador numa escola nunca dá acesso à consola. A consola protege-se no
navegador, mas o que conta são as verificações das operações da plataforma no servidor.

## Cabeçalhos de segurança

Todas as aplicações (SIGA, portal, consola, documentação e PayFlow) enviam HSTS,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` e protecção
contra serem embebidas noutro site. No SIGA, a política de conteúdo (CSP) ainda está em
modo de relatório.
