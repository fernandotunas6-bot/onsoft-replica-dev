# Revisão de segurança — YFT (18/10/2026)

Revisão do Worker (`school-worker/src`, ~3 000 linhas) e dos pontos da app que
decidem acesso. Leitura estática, mais os testes `vitest` que correm aqui.
**Não houve teste de intrusão, nem base de dados real, nem Firebase real**: o
que está abaixo sai do código, não de uma exploração executada.

As quatro fragilidades que o `estudo/README.md` já dava como corrigidas
(guarda do router, comparação da chave do super-admin em tempo constante, CORS
fechado, erro de `tsc`) foram confirmadas no código.

## Corrigido nesta revisão

### 1. Conta removida continuava a entrar pelas claims do token

`resolveTenantUser` tinha um terceiro ramo: sem linha na tabela `Users`,
aceitava o `school_id` e o `role` que viessem nas claims do token, «para a
adesão ou se a base estiver dessincronizada». Mas os três caminhos que criam
contas — adesão da escola, registo de professor e admissão de aluno — inserem
sempre em `Users`, pelo que nenhuma conta legítima precisava do ramo. O que ele
dava era o contrário: **apagar o utilizador da base não lhe retirava o acesso**,
enquanto o token e as claims no Firebase se mantivessem. A identidade passa a
vir sempre da base; sem linha não há sessão. Teste novo.

Nota: nenhum código deste repositório escreve claims personalizadas, por isso o
ramo só podia ser alcançado por claims postas fora dele.

### 2. O tipo das imagens era o que o cliente declarava

`POST /api/media/profile-photo` e `POST /api/super-admin/upload-logo` aceitavam
o `type` do `File` e guardavam-no como `Content-Type` no R2 — o mesmo
`Content-Type` com que `GET /media/*` devolve o ficheiro. Bastava anunciar
`image/png` para guardar qualquer coisa e fazer com que fosse servida como
imagem. O tipo passa a ser decidido pela assinatura dos primeiros bytes
(`src/lib/media-type.ts`): PNG, JPEG e WebP nas fotografias; nos logótipos
também SVG, verificado como raiz `<svg` e servido com
`Content-Security-Policy` restritiva, como já era. A mensagem de erro deixou de
repetir o tipo que o cliente enviou. Três testes novos.

### 3. Mensagens de erro do servidor em inglês

O middleware de autenticação e o `GET /media/*` devolviam texto em inglês que a
app mostra tal e qual, incluindo o aviso de escola suspensa. Traduzidos.

## Não corrigido — precisa de decisão do utilizador

### A. Senha partilhada por escola, em texto limpo (o mais grave)

`migrations/0004_add_school_defaults.sql` cria `Schools.default_password` com o
valor `'Welcome@123'`. Essa senha:

- é a senha **real** com que as contas são criadas no Firebase — professores
  (`src/api/users.ts:232`) e encarregados (`src/api/students.ts:460`);
- é igual para toda a escola, e o valor inicial é público neste repositório;
- fica guardada em texto limpo na base, legível por qualquer leitura de
  `Schools`;
- não obriga a mudança na primeira entrada: não há sinalizador para isso, e a
  app não mostra nem pede nada.

Hoje, numa escola que não mude o valor, conhecer o e-mail ou o telefone de um
encarregado basta para entrar na conta dele. Corrigir implica mudar o fluxo, e
por isso fica à sua decisão:

1. Gerar uma senha temporária por conta (`createTempPassword()` já existe) e
   devolvê-la **uma vez** na resposta da criação, para o administrador a
   entregar à pessoa — obriga a mostrar essa senha no ecrã de registo, que hoje
   só diz «Professor registado».
2. Acrescentar `must_change_password` e exigir a troca na primeira entrada.
3. Deixar de guardar `default_password`; se a escola quiser mesmo uma senha
   comum, que seja escrita no momento do convite e não persistida.

Recomendo 1 + 2. Nenhuma das três foi implementada porque muda o percurso de
quem usa a app, e isso é uma escolha sua, não minha.

### B. `/media/*` é público

A rota está registada fora do `authMiddleware`: qualquer pessoa com a chave
descarrega o ficheiro. As chaves são aleatórias (`img_…`, `logo_…`) e o R2 não
expõe listagem, mas são **fotografias de alunos, dados pessoais de menores**,
servidas com `max-age` de um ano e `immutable`. Um endereço que escape fica
válido para sempre. Opções: servir através do `authMiddleware` com verificação
da escola, ou usar URLs assinados com validade curta.

### C. Detalhe dos erros de validação

As respostas de erro incluem `parsed.error.flatten()`, que descreve a forma
esperada do pedido. Ajuda a depurar e não expõe dados, mas também desenha o
esquema a quem sonda a API. Decisão de gosto; fica anotado.

### D. Sem revogação a meio da validade do token

Os tokens do Firebase valem cerca de uma hora e são validados por JWKS, sem
consulta de revogação. Desactivar uma conta no Firebase não corta a sessão em
curso — só a renovação. A verificação de escola suspensa, essa, é feita a cada
pedido, contra a base.

## Verificado e sem problema encontrado

- **Isolamento por escola**: das 104 declarações SQL, as 26 sem `school_id` são
  leituras da própria escola (`Schools WHERE id = ?`), rotas de super-admin, que
  são globais por desenho, ou a tabela `SuperAdmins`. Os dois `UPDATE` com
  colunas dinâmicas (`Classes`, `Students`) levam `AND school_id = ?`, e as
  colunas vêm de uma lista fixa no código, não do pedido — não há injecção.
- **Encarregados**: `/api/wards` e `/api/notices` filtram sempre por
  `school_id` **e** `parent_uid`/`user_uid`. Marcar um aviso como lido confirma
  primeiro que o aviso é da escola e do próprio.
- **Super-admin**: todas as rotas passam por `requireSuperAdminKey`, incluindo
  o `upload-logo`, que estava declarado mais abaixo no ficheiro.
- **`GET /media/*`**: recusa `..`, caminhos absolutos e prefixos fora de
  `logos/` e `profile-photos/`; envia `X-Content-Type-Options: nosniff`.
- **Papéis**: `requireAdmin`, `requireAdminOrTeacher` e `requireRoles` leem o
  papel resolvido na base, não o do token. Lançar notas exige, além do papel,
  `teacher_can_edit_results` da escola.

## Estado da validação

`npx tsc --noEmit` sem erros, **10 testes `vitest`** a passar (eram 6) e
`npx wrangler deploy --dry-run` a empacotar. Nada foi publicado.
