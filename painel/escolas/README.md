# Website institucional por escola — ISPAB

Website independente preparado para a Onsoft oferecer a escolas clientes. O visual aprovado é conservado: 65 páginas, 18 exemplos de formação e portal demonstrativo. Não substitui os cinco produtos do ecossistema nem a operação escolar no SIGA.

## Executar

Node 24. Sem instalação de dependências neste painel.

```sh
cd painel/escolas
npm run build
npm run check
npm test
npm run dev
```

A prévia está em `http://127.0.0.1:4174`. Publique `dist/` no host estático escolhido para a escola. Este checkout não herda o projecto Sites, o Git, as credenciais ou a audiência privada do ambiente de autoria.

## Configuração por cliente

`school.config.json` contém o identificador local, o nome curto, o país, o idioma, o símbolo da moeda e o nome da moeda (`currencyName`, usado no corpo das frases; por omissão é o próprio símbolo). O nome/país são aplicados ao gerar o website; o identificador separa o armazenamento demonstrativo de cada escola. O idioma e os conteúdos pedagógicos continuam a precisar de revisão para cada instituição.

Os textos, rótulos e ligações do site estão em `content/` — navegação, cabeçalho, rodapé e os blocos repetidos em todas as páginas. São ficheiros JSON validados no build: uma chave em falta é um erro com o caminho no JSON, e o conteúdo é sempre escapado. Ver `content/README.md`.

### Cores

`palette`, em `school.config.json`, muda os tokens de cor do site:

```json
"palette": { "blue": "#1a7f4b", "deep": "#0d2a1b" }
```

Os tokens são `blue` (cor de marca: botões, ligações, ênfase dos títulos,
pontos), `deep` (títulos), `text`, `muted`, `line`, `soft` e `lime`. Só é
preciso nomear os que mudam; o build acrescenta um `:root` no fim do CSS com
esses e a `<meta name="theme-color">` segue o `blue`. Sem `palette`, o CSS sai
tal como está.

Com `blue` configurado, o build roda a **família de azuis do CSS inteiro** para
a cor da escola: mesma luminosidade, mesma relação entre tons, outro matiz.
Isto apanha as cerca de 600 cores escritas à mão — incluindo o gradiente do
`.button` em `polish.css`, que se sobrepunha ao `var(--blue)` e mantinha o
botão principal azul numa escola verde. O lima do desenho e as cores dos
cartões de área (roxo, areia) ficam como estão, por estarem fora da família.

Sem `palette`, o CSS sai byte a byte igual ao de origem.

`portalUrl`, quando configurado com o endereço HTTPS oficial da escola, faz o botão de acesso usar o SIGA Plus existente. Não cria um login nem duplica notas, finanças ou sessões. O perfil local do portal continua explicitamente demonstrativo.

## Publicar sem a demonstração

O site nasce em modo de demonstração: avisa em cada página que a oferta é
ilustrativa e que as candidaturas não são enviadas. `"demo": false` em
`school.config.json` desliga isso — e o build só o aceita quando o que o site
deixa de avisar passa a ser verdade:

| O build exige | Porquê |
| --- | --- |
| `api` (`origin` + `campaignSlug`) | Sem destino, o formulário não envia nada. Com ele, a candidatura vai para o SIGA e devolve o número oficial `CAND-…`. |
| `portalUrl` | Sem ele, o acesso ao portal apontaria para a demonstração. |
| `catalogue.source` em `src/data.mjs` diferente de `"exemplo"` | Os 18 cursos, os artigos e os eventos de exemplo não podem ser publicados como a oferta de uma escola. |
| `privacidade`, `acessibilidade` e `candidatura` sem `"demo": true` | Fazem afirmações legais — política de dados, conformidade, consentimento — que só a instituição pode escrever. |

Com isso, o site deixa de publicar as nove páginas do portal demonstrativo e a
página «Sobre o projecto», e desaparecem os avisos, as etiquetas («LEITURA
DEMONSTRATIVA», «Curso demonstrativo») e a barra «Prévia institucional». O
formulário de candidatura passa a carregar os cursos da campanha real e a
enviar para a API; em caso de falha mostra a mensagem correspondente e não dá
a candidatura por submetida.

Antes de publicar, confirme a origem na allowlist do SIGA
(`SIGA_SCHOOL_WEBSITE_ORIGINS`): sem ela, o POST é recusado por CORS.

## Integração de API incluída

- `GET /api/public/school-website/{campaignSlug}` — nome/contactos públicos autorizados, campanha aberta e cursos superiores activos dessa escola.
- `POST` no mesmo endereço — schema de candidatura já existente; devolve o número oficial `CAND-...`.
- Cliente sem dependências em `integration/client.mjs`. Exemplo de configuração em `integration/config.example.json`.
- Origens exactas por **slug da campanha**, no servidor SIGA: `SIGA_SCHOOL_WEBSITE_ORIGINS`. O slug não é presumido a partir do nome ISPAB.

```js
import {createSigaWebsiteClient} from './integration/client.mjs';
const api=createSigaWebsiteClient({
  apiOrigin:'https://siga.example',
  campaignSlug:'campanha-publica-da-escola',
  portalUrl:'https://escola.siga.example/auth'
});
const {school,programs}=await api.getSchool();
// Apenas numa submissão explícita, com consentimento e IDs reais vindos da API:
const receipt=await api.submitApplication({
  person:{full_name:'Nome do candidato'},
  desiredProgramId:programs[0].id
});
```

Os domínios `.example` são exemplos e não devem ser usados em produção.

## Editor no SIGA e activação

O administrador gere textos, imagens, links e metadados das páginas públicas existentes em **Definições → Website escolar**. O editor guarda rascunhos, publica pela API e pode associar cursos aos programas activos da escola. O nome e a desactivação desses programas acompanham o SIGA automaticamente; descrições e requisitos continuam editoriais.

`GET /api/public/school-content/{publicCode}` fornece só a publicação. A configuração inicial do website usa `portalUrl` e `contentUrl`, definidos em `school.config.json` antes do build ou em `school-runtime.json` na hospedagem. O painel do administrador copia estes endereços com os valores da instalação e da escola activa, sem chaves.

Ao seleccionar uma campanha da escola e publicar, os botões de candidatura abrem o formulário oficial existente no SIGA; uma campanha encerrada desactiva esses botões. A sessão, os documentos e a submissão oficial permanecem no sistema. O SDK descrito acima também está disponível para futuras interfaces próprias, mas não se sobrepõe ao formulário oficial.

A prévia publicada continua em demonstração até serem configurados os endereços reais e implantada a API na instalação SIGA. Não há ligação activa a uma escola de produção nesta entrega. Os registos locais não são convertidos em candidaturas reais. Novos cursos/páginas e mudanças de estrutura exigem actualizar o template; os conteúdos dos registos existentes são editáveis no painel.

Ver o [guia de edição, publicação e activação](../../docs/architecture/SCHOOL_WEBSITE_CONTENT.md). Não criar outra base por escola, não expor chaves Supabase e não usar o login ChatGPT da hospedagem como identidade académica. Notas, documentos e finanças privados continuam no SIGA autenticado.

## Falhas e dados

Sem campanha, com escola suspensa ou serviço indisponível, a API falha fechada. O cliente não faz fallback para dados de outra escola e não repete POST automaticamente. Após `submission_unknown`, reconciliar no SIGA antes de reenviar. A API não fornece consulta anónima de candidaturas: não expor candidatos por referência, e-mail ou nome.

Ver [documentação da ligação](../../docs/architecture/SCHOOL_WEBSITE_API.md).
