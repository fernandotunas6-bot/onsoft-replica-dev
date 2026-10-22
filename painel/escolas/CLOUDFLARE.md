# Publicação do website ISPAB no Cloudflare Pages

O projecto **siga-ispab** foi criado na conta Cloudflare em 20/10/2026, com domínio `https://siga-ispab.pages.dev`. É um projecto **Direct Upload**, separado de `siga-web`, `siga-admin`, `siga-docs` e do Worker do SIGA.

**Atenção:** a criação do projecto não publica ficheiros. Só considerar o site no ar após verificar um deployment `success`, resposta HTTP 200 e navegação das páginas. O site permanece **demonstrativo** até à homologação dos dados reais e consentimento institucional.

## Pipeline

A workflow `.github/workflows/siga-ispab-cloudflare.yml` gera `painel/escolas/dist`, verifica páginas/links e testes e publica-o por Wrangler. Corre apenas em `main` quando este painel ou a workflow muda, e também pode ser iniciada manualmente. Não publica o SIGA nem aplica SQL.

## Configuração indispensável

No GitHub, no ambiente **production** usado pela workflow (ou, se não houver política de ambiente, nos segredos do repositório), disponibilizar:

- `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare que contém `siga-ispab`.
- `CLOUDFLARE_API_TOKEN`: token **novo**, com permissão de edição Cloudflare Pages limitada à conta adequada.

Nunca adicionar tokens ao código, histórico de commits, comentários ou variáveis `VITE_*`. Um token anterior foi rejeitado pelo Cloudflare em publicações do ecossistema. A tentativa de ligação Git ao Pages também foi recusada com erro de instalação Git: esta workflow **não depende** daquela ligação, mas continua a exigir um token de API válido.

Depois: executar a workflow e consultar Cloudflare Pages → `siga-ispab` → Deployments. Confirmar 200 em /, /cursos/, /candidatura/, /ajuda/, presença dos assets e texto de demonstração. Se falhar, não alterar nem substituir os outros projectos.

## Dados reais

A API SIGA para campanhas é separada da publicação estática. Para candidaturas reais: confirmar campanha/slug, oferta académica e contactos oficiais, configurar a allowlist `SIGA_SCHOOL_WEBSITE_ORIGINS` no Worker do SIGA, ligar explicitamente o cliente e validar em staging. Não ligar o POST real a formulários rotulados como simulação.
