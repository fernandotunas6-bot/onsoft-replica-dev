# Início Rápido com Vite (SPA)

Comece a trabalhar com a versão Vite do **SIGA Plus** em poucos minutos.

## Pré-requisitos

Antes de começar, certifique-se de que tem:

- **Node.js** (v18.0.0 ou superior)
- **npm** ou **pnpm**
- **Acesso ao Pacote Institucional** SIGA Plus

## Instalação & Configuração Inicial

### Passo 1: Extrair o Pacote Oficial do SIGA Plus

Extraia o arquivo comprimido da distribuição proprietária recebida do portal institucional:

```bash
cd onsoft-replica-dev/painel/web
```

### Passo 2: Instalar Dependências

```bash
npm install
```

### Passo 3: Configurar Banco de Dados & Conexão Central

Edite o ficheiro `.env` com a sua ligação do Supabase/PostgreSQL e URL do Painel Admin Central:

```env
VITE_SUPABASE_URL=https://sua-instancia.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
SIGA_CENTRAL_ADMIN_URL=https://central-admin.siga.plus
```

Aplique os scripts SQL do SIGA Plus:

```bash
npm run siga:sql
```

### Passo 4: Pedido de Aprovação e Ativação no Painel Admin Central

1. Inicie o servidor local: `npm run dev`
2. Aceda a `http://localhost:5173`. O ecrã indicará: `Instância Registada - Aguardando Aprovação`.
3. O administrador da plataforma acede ao **Painel Admin Central (SGA Core)** e aprova o licenciamento da instituição.
4. O **Painel Admin do Cliente** é ativado automaticamente com permissões restritas (RBAC).

---

## Verificação

Após o desbloqueio da licença, deverá ver:

1. **Painel do Cliente** - Consola administrativa com permissões limitadas pelo seu perfil (Direção, Secretaria, Financeiro, Docente)
2. **Personalizador de Tema** - Ajuste do esquema de cores institucional
3. **Módulos Integrados** - Pautas, turmas, mensalidades e estado das catracas físicas

---

## Scripts Disponíveis

```bash
npm run dev          # Iniciar servidor de desenvolvimento
npm run build        # Compilar aplicação para produção
npm run siga:check   # Verificar integridade dos módulos SIGA
npm run siga:sql     # Executar atualizações de base de dados
```

---

## Próximos Passos

- **[Guia de Desenvolvimento](/vite/development)** - Aprenda o fluxo de trabalho de desenvolvimento
- **[Build & Implantação](/vite/build-deploy)** - Implante a sua aplicação em produção
- **[Licença Proprietária](/guide/license)** - Consulte os termos de licenciamento comercial
