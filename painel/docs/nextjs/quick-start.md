# Início Rápido com Next.js

Comece a trabalhar com a versão Next.js (SSR/SSG) do **SIGA Plus** em poucos minutos.

## Pré-requisitos

Antes de começar, certifique-se de que tem:

- **Node.js** (v18.17.0 ou superior)
- **npm** ou **pnpm**
- **Acesso ao Pacote Institucional** SIGA Plus

## Instalação & Configuração Inicial

### Passo 1: Extrair o Pacote Oficial do SIGA Plus

Extraia a distribuição proprietária recebida do portal institucional:

```bash
cd onsoft-replica-dev/painel/admin
```

### Passo 2: Instalar Dependências

```bash
npm install
```

### Passo 3: Configurar Banco de Dados & Chaves

Crie o ficheiro `.env.local` com as variáveis do Supabase/PostgreSQL e endereço do servidor de licenças:

```env
NEXT_PUBLIC_SUPABASE_URL="https://sua-instancia.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-chave-anonima"
SIGA_CENTRAL_ADMIN_URL="https://central-admin.siga.plus"
```

Execute as atualizações de base de dados:

```bash
npm run siga:sql
```

### Passo 4: Pedido de Aprovação e Ativação no Painel Admin Central

1. Inicie o servidor local: `npm run dev`
2. Aceda a `http://localhost:3000`. O ecrã apresentará o estado: `Aguardando Aprovação da Licença`.
3. O administrador do sistema acede ao **Painel Admin Central (SGA Core)** em `Aprovação de Clientes`.
4. Após o administrador aprovar a submissão, a chave digital ativa o **Painel Admin do Cliente** com acessos granulares baseados nos papéis configurados.

---

## Verificação

Após a aprovação da licença, terá acesso às seguintes áreas:

1. **Painel do Cliente** - Consola administrativa com acessos restritos por perfil (Administrador Institucional, Secretaria, Financeiro, Docentes)
2. **Personalizador de Tema** - Ajuste de cores institucionais e tipografia
3. **Módulos Integrados** - Pautas, turmas, controlo de propinas e pontes de hardware (Catracas)

---

## Scripts Disponíveis

```bash
npm run dev              # Iniciar servidor de desenvolvimento
npm run build            # Criar compilação de produção
npm run start            # Iniciar servidor de produção
npm run siga:check       # Verificar integridade dos módulos SIGA
npm run siga:sql         # Executar scripts de base de dados
```

---

## Próximos Passos

- **[Guia de Desenvolvimento](/nextjs/development)** - Aprenda o fluxo de trabalho de desenvolvimento
- **[Compilação e Implantação](/nextjs/build-deploy)** - Implante em produção
- **[Licença Proprietária](/guide/license)** - Termos da licença comercial do SIGA Plus
