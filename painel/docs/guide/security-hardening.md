# Endurecimento de segurança

As defesas que o SIGA Plus tem hoje, tal como estão no código. Quem vê o quê, por cargo e
por módulo, está em [Segurança de rotas e acessos](./route-security.md).

## Entrar e manter a sessão

**Senhas.** Pelo menos 8 caracteres, com maiúsculas, minúsculas e números. É a mesma regra
no ecrã e no serviço de autenticação. Ao escolher uma senha, o SIGA Plus avisa se ela
aparece em fugas de dados conhecidas. A consulta ao HaveIBeenPwned é anónima: só saem do
navegador os 5 primeiros caracteres do resumo SHA-1 da senha. É uma ajuda a quem escolhe,
não uma barreira: se o serviço não responder, o formulário segue.

**Tentativas.** O início de sessão por senha tem uma verificação anti-robô (hCaptcha). A
entrada com o Nº de BI, o telefone ou o Nº de aluno passa pelo servidor do SIGA Plus, que
aceita no máximo:

| O quê                                     | Limite            |
| ----------------------------------------- | ----------------- |
| Entrada, por endereço IP                  | 10 por minuto     |
| Entrada, por conta (de qualquer IP)       | 10 por 15 minutos |
| Ligação de entrada por e-mail             | 5 por 15 minutos  |
| Código de recuperação da senha, por IP    | 30 por hora       |
| Código de recuperação da senha, por conta | 20 por dia        |

Os contadores vivem na base de dados e valem para todos os servidores; se a base de dados
não responder, cada servidor aplica o seu próprio limite. Conta desconhecida e senha errada
recebem a mesma resposta, para não revelar que contas existem.

**Duração da sessão.** Sem verificação em dois passos (2FA), a sessão termina ao fim de
30 minutos sem actividade. Depois de uma verificação 2FA, o navegador fica reconhecido
durante 30 dias. A verificação volta a ser pedida quando passam os 30 dias, quando o
navegador ou o sistema operativo mudam e quando a pessoa termina a sessão. Mudar a senha
termina as sessões abertas noutros dispositivos.

**Acções críticas.** Pedem uma nova confirmação de identidade, mesmo com a sessão aberta.
Numa conta com 2FA, mudar a senha pede sempre o segundo factor.

**Onde fica a sessão.** Num cookie do domínio da plataforma (`Secure`, `SameSite=Lax`): uma
entrada vale em todos os subdomínios das escolas, e terminar a sessão termina-a em todos.
O servidor não se guia por esse cookie, só pelo cabeçalho `Authorization` que a aplicação
envia. Por isso, outro site não consegue fazer pedidos em nome de quem tem a sessão aberta
(CSRF). O cookie é legível pela aplicação, como era o armazenamento local antes dele: a
defesa contra o roubo da sessão é não deixar correr código alheio na página.

## Código alheio na página (XSS)

- O React escapa todo o texto que mostra. Só um componente insere HTML directamente (os
  estilos dos gráficos), a partir de valores fixos.
- Os modelos de impressão que a escola personaliza são recusados se tiverem código activo
  (scripts, atributos `on…`, ligações `javascript:`, iframes). A pré-visualização abre num
  iframe isolado (`sandbox`).
- Os dados que entram nos e-mails são escapados antes de irem para o HTML.
- A política de conteúdo (CSP) do SIGA está em **modo de relatório**: o navegador não
  bloqueia nada, só comunica o que bloquearia. Passa a obrigatória quando os relatórios
  estiverem limpos.

## No servidor

- Cada operação valida os dados recebidos com um esquema antes de os usar, e confirma a
  sessão e o cargo antes de ler ou gravar. Um teste automático impede que se publique uma
  operação nova sem guarda.
- As consultas à base de dados passam pelo cliente do Supabase, com valores separados das
  instruções. As pesquisas por texto limpam os caracteres que alterariam o filtro.
- As operações públicas por natureza (matrícula online, criação de escola, verificação de
  documentos, catracas) têm limites de pedidos.
- As rotas HTTP da API (`/api/…`: app móvel, catracas, avisos de pagamentos, e-mail e SMS,
  registo de escolas e consola) recusam corpos acima de um tamanho máximo, com o erro 413.
  Os avisos dos fornecedores continuam a ser lidos byte a byte, para a assinatura valer.

## Na base de dados

- Segurança ao nível da linha (RLS) em todas as tabelas: 216 de 216 no retrato de produção
  de 29/10/2026.
- Ser membro da escola não basta para gravar nem para ler dados sensíveis, porque alunos e
  encarregados também são membros. As escritas pedem o cargo certo.
- As tabelas mais sensíveis (histórico académico, acompanhamento de alunos em risco, bolsas,
  caixa, cobranças de pagamento, chaves das catracas, registo das acções da consola) só são
  acessíveis pelo servidor, depois das verificações acima.

## Catracas e leitores de cartões

- Cada leitor identifica-se com a chave do seu dispositivo. Uma chave errada conta para um
  limite de 20 tentativas por 15 minutos, por endereço IP.
- Cada dispositivo aceita até 120 leituras por minuto. Mais do que isso é alguém a percorrer
  números de cartão, porque a resposta traz o nome e a fotografia do aluno.
- O servidor só deixa passar se o dispositivo não estiver em «Manutenção» nem «Offline», se
  o cartão estiver activo e se o aluno estiver activo (ou for candidato). Um aluno
  transferido, com o curso concluído, cancelado, suspenso ou bloqueado não passa.
- Cada leitura fica registada, com o motivo quando a passagem é recusada.

## Cabeçalhos HTTP

Todas as aplicações enviam HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e
`Permissions-Policy`, e protegem-se contra serem embebidas noutro site:

| Aplicação                                         | Pode ser embebida                             |
| ------------------------------------------------- | --------------------------------------------- |
| SIGA, portal comercial (WEB) e documentação (DOC) | só dentro da própria aplicação (`SAMEORIGIN`) |
| Consola da plataforma (ADMIN) e PayFlow           | nunca (`DENY`)                                |

A consola e as páginas do PayFlow, excepto a inicial, pedem aos motores de pesquisa que não
as indexem.

O SIGA permite a câmara (fotografias) e a localização (presença dos professores) só a si
próprio, e desliga o microfone, os pagamentos pelo navegador e o USB. As outras aplicações
desligam todos estes acessos.

## Segredos e dependências

- Os ficheiros `.env` ficam fora do repositório; só os `.env.example`, sem valores reais,
  são guardados.
- O SIGA no navegador recusa-se a arrancar com uma chave secreta do Supabase: só aceita a
  chave publicável. As chaves secretas vivem nos segredos da publicação.
- A integração contínua falha quando uma dependência do SIGA, ou uma dependência de
  produção dos painéis, tem uma vulnerabilidade alta ou crítica conhecida.
- Se uma chave for exposta: revogá-la no fornecedor, criar outra e actualizar o segredo da
  publicação.

## Desenvolvimento local

O servidor de desenvolvimento do SIGA escuta em todas as interfaces de rede, porque o Lovable
precisa. Numa rede em que não confia, use a firewall do computador. A documentação
(`vitepress dev`) e o portal comercial escutam só no próprio computador, a menos que se
acrescente `--host`.
