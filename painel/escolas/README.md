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

`school.config.json` contém o identificador local, o nome curto e o país. O nome/país são aplicados ao gerar o website; o identificador separa o armazenamento demonstrativo de cada escola. O idioma e os conteúdos pedagógicos continuam a precisar de revisão para cada instituição.

`portalUrl`, quando configurado com o endereço HTTPS oficial da escola, faz o botão de acesso usar o SIGA Plus existente. Não cria um login nem duplica notas, finanças ou sessões. O perfil local do portal continua explicitamente demonstrativo.

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
