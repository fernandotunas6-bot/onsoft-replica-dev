# Documentação do SIGA Plus (SIGA)

Este diretório contém a documentação completa para o SIGA Plus, construída com VitePress para obter excelente desempenho e experiência do utilizador no âmbito do Sistema SIGA.

## Estrutura da Documentação

A documentação está organizada em seções específicas de framework para fornecer orientação direcionada:

### Primeiros Passos
- **[Visão Geral](./index.md)** - Introdução ao projeto e funcionalidades
- **[Guia de Instalação](./guide/installation.md)** - Instruções completas de configuração
- **[Comparação de Frameworks](./guide/choosing-framework.md)** - Guia de decisão entre Vite e Next.js

### Guias Específicos por Framework
- **[Versão Vite](./vite/)** - React + Vite + React Router DOM
- **[Versão Next.js](./nextjs/)** - Next.js 15 + App Router

### Sistema de Componentes
- **[Biblioteca de Componentes](./components/)** - Integração com shadcn/ui v3
- **[Customizador de Tema](./theme-customizer/)** - Edição de tema em tempo real
- **[Layouts](./layouts/)** - Sistema de layouts e navegação

### Tópicos Avançados
- **[Implantação](./deployment/)** - Guias de implantação em produção
- **[Personalização](./customization/)** - Estilização e personalização
- **[Migração](./migration/)** - Migração entre frameworks e versões

## Desenvolvimento

### Pré-requisitos
- Node.js (v18.0.0 ou superior)
- pnpm (recomendado) ou npm/yarn

### Desenvolvimento Local

```bash
# Instalar dependências
pnpm install

# Iniciar servidor de desenvolvimento
pnpm dev
# ou usar o script utilitário
./dev.sh

# A documentação estará disponível em http://localhost:5173
```

### Compilar Documentação

```bash
# Compilar para produção
pnpm build

# Pré-visualizar a compilação de produção
pnpm preview
```

## Filosofia da Documentação

Esta documentação segue os seguintes princípios:

### Organização Específica por Framework
Em vez de misturar instruções do Vite e do Next.js, cada framework possui seções dedicadas para evitar confusão e fornecer orientação precisa.

### Foco na Jornada do Utilizador
A documentação está organizada pelos objetivos dos utilizadores em vez dos detalhes de implementação técnica:
- Configuração rápida para resultados imediatos
- Personalização avançada para utilizadores experientes
- Caminhos de migração para troca de framework

### Exemplos Abrangentes
Cada conceito inclui exemplos de código funcionais que podem ser copiados e utilizados imediatamente.

### Orientado ao Desempenho
O VitePress oferece:
- Geração rápida do site
- Excelentes recursos de pesquisa
- Experiência otimizada para dispositivos móveis
- Suporte a modo escuro/claro

## Pesquisa e Navegação

A documentação inclui:
- **Pesquisa em texto completo** em todo o conteúdo
- **Navegação na barra lateral** com seções recolhíveis
- **Referências cruzadas** entre tópicos relacionados
- **Design responsivo** para dispositivos móveis

## Contribuindo para a Documentação

Para melhorar a documentação:

1. **Edite os ficheiros Markdown** nos diretórios apropriados
2. **Testes localmente** com `pnpm dev`
3. **Siga o guia de estilo** para manter a consistência
4. **Atualize a navegação** em `.vitepress/config.ts` se necessário

### Diretrizes de Estilo

- Use cabeçalhos claros e descritivos
- Inclua exemplos de código para todos os conceitos
- Adicione notas específicas de framework onde for relevante
- Mantenha as explicações concisas, porém completas
- Use a formatação Markdown adequada

### Organização de Ficheiros

```
docs/
├── .vitepress/
│   ├── config.ts          # Configuração do VitePress
│   └── theme/             # Componentes de tema personalizados
├── guide/                 # Guias de primeiros passos
├── vite/                  # Documentação específica do Vite
├── nextjs/                # Documentação específica do Next.js
├── components/            # Documentação da biblioteca de componentes
├── theme-customizer/      # Guias de personalização de temas
├── layouts/              # Documentação do sistema de layouts
├── deployment/           # Guias de implantação
├── customization/        # Guias de personalização
├── migration/            # Guias de migração
├── api/                  # Referência da API
└── examples/             # Exemplos de uso
```

## Implantação

A documentação pode ser implantada em qualquer provedor de hospedagem estática:

### Vercel (Recomendado)
```bash
# Implantar na Vercel
vercel

# ou vincular a um repositório Git para implantações automáticas
```

### Netlify
```bash
# Comando de build: pnpm build
# Diretório de publicação: .vitepress/dist
```

### GitHub Pages
```bash
# Usar GitHub Actions com a ação de implantação do VitePress
```

## Atualizações de Conteúdo

### Adicionar Novas Páginas

1. Crie ficheiros Markdown no diretório adequado
2. Atualize a navegação da barra lateral em `.vitepress/config.ts`
3. Adicione referências cruzadas a partir de páginas relacionadas
4. Teste o processo de compilação

### Atualizar Conteúdo Existente

1. Edite os ficheiros Markdown relevantes
2. Mantenha a consistência com o estilo existente
3. Atualize quaisquer referências cruzadas afetadas
4. Verifique se todos os exemplos de código continuam funcionando

## Configuração do VitePress

A documentação utiliza as seguintes funcionalidades do VitePress:

- **Configuração de Tema** - Barra lateral e navegação personalizadas
- **Integração de Pesquisa** - Pesquisa local com indexação de texto completo
- **Realce de Código** - Realce de sintaxe para várias linguagens
- **Componentes Personalizados** - Componentes Vue para conteúdo aprimorado
- **Otimização de SEO** - Meta tags e cartões para redes sociais

## Desempenho

A documentação é otimizada para:
- **Carregamento Rápido** - JavaScript mínimo, recursos otimizados
- **Desempenho da Pesquisa** - Indexação eficiente
- **Experiência Móvel** - Design responsivo e navegação tátil
- **Acessibilidade** - Estrutura e navegação em conformidade com WCAG

## Resolução de Problemas

### Problemas Comuns

**Falhas de Compilação:**
- Verifique se existem links internos quebrados
- Verifique se todos os ficheiros importados existem
- Garanta a sintaxe Markdown correta

**Pesquisa Não Funciona:**
- Reconstrua a documentação
- Verifique se existem erros de JavaScript
- Verifique a geração do índice de pesquisa

**Problemas de Navegação:**
- Verifique a configuração da barra lateral em `.vitepress/config.ts`
- Certifique-se de que os caminhos dos ficheiros correspondem aos links de navegação
- Verifique a estrutura correta dos cabeçalhos

## Licença

A documentação e o software são protegidos sob a Licença Proprietária Comercial do SIGA Plus. Todos os direitos reservados.

