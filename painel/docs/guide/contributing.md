# Contribuição

Ajude a melhorar o template SIGA Plus.

## Início Rápido

1. Faça um **Fork** do repositório
2. **Clone** o seu fork localmente
3. **Instale** as dependências: `pnpm install`
4. **Crie** uma ramificação (branch) de funcionalidade
5. **Faça** as suas alterações
6. **Testes** em ambas as versões (Vite e Next.js)
7. **Submeta** um pull request

## Configuração de Desenvolvimento

```bash
# Clone repository
git clone https://github.com/your-username/shadcn-dashboard-template.git
cd shadcn-dashboard-template

# Install dependencies for both versions
cd vite-version && pnpm install
cd ../nextjs-version && pnpm install

# Start development servers
pnpm dev  # In each version directory
```

## Diretrizes de Contribuição

### Padrões de Código
- **TypeScript** para todo o código novo
- Formatação com **ESLint/Prettier**
- Convenções de nomenclatura **consistentes**
- Componentes do cliente (Client components) devem utilizar a diretiva `"use client"`

### Requisitos de Testes
- Testar alterações em **ambas as versões (Vite e Next.js)**
- Verificar o design **responsivo** em mobile/desktop
- Verificar a **acessibilidade** com leitores de ecrã
- Testar a compatibilidade com modo **escuro/claro**

### Compatibilidade entre Duas Versões
Todas as alterações devem funcionar em ambas as frameworks:
- **Vite**: React Router DOM, renderização no lado do cliente
- **Next.js**: App Router, renderização no lado do servidor
- **Componentes partilhados**: Utilizar padrões agnósticos de framework

## Áreas para Contribuição

### Componentes
- Novos componentes shadcn/ui
- Melhorias nos componentes existentes
- Melhorias de acessibilidade
- Otimizações de desempenho

### Funcionalidades
- Widgets de dashboard
- Personalizações de temas
- Variações de layout
- Melhorias em tabelas de dados

### Documentação
- Exemplos de código
- Guias de implementação
- Boas práticas
- Tutoriais em vídeo

### Correção de Bugs
- Compatibilidade entre navegadores
- Responsividade móvel
- Problemas de desempenho
- Bugs de acessibilidade

## Processo de Pull Request

1. **Descreva** as suas alterações de forma clara
2. **Inclua** capturas de ecrã (screenshots) para alterações na UI
3. **Referencie** quaisquer issues relacionadas
4. **Testes** exaustivamente em ambas as versões
5. **Atualize** a documentação se necessário

## Comunidade

- **GitHub Issues** - Relatórios de bugs e pedidos de funcionalidades
- **Discussions** - Perguntas e ajuda da comunidade
- **Discord** - Chat e suporte em tempo real

---

Obrigado por contribuir! Cada melhoria ajuda a comunidade.

## Primeiros Passos

### Ambiente de Desenvolvimento

**Pré-requisitos**
- Node.js 18+ instalado
- Gestor de pacotes pnpm (recomendado)
- Git para controlo de versões
- Editor de código (VS Code recomendado)

**Fork e Clone**
```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/shadcn-dashboard-landing-template.git
cd shadcn-dashboard-landing-template

# Add upstream remote
git remote add upstream https://github.com/onsoft/shadcn-dashboard-landing-template.git
```

**Instalar Dependências**
```bash
# Install dependencies for both versions
cd vite-version && pnpm install
cd ../nextjs-version && pnpm install
cd ../docs && pnpm install
```

**Iniciar Desenvolvimento**
```bash
# Vite version
cd vite-version && pnpm dev

# Next.js version
cd nextjs-version && pnpm dev

# Documentation
cd docs && pnpm dev
```

## Fluxo de Trabalho de Desenvolvimento

### Estratégia de Branches

**Criar Branch de Funcionalidade**
```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Convenções de Nomenclatura de Branches**
- `feature/component-name` - Novas funcionalidades
- `fix/issue-description` - Correção de bugs
- `docs/section-name` - Atualizações de documentação
- `refactor/component-name` - Refatoração de código
- `perf/optimization-area` - Melhorias de desempenho

### Padrões de Código

**TypeScript em Primeiro Lugar**
- Todo o código novo deve ser em TypeScript
- Fornecer definições de tipos adequadas
- Utilizar configuração rigorosa de TypeScript
- Exportar tipos para componentes reutilizáveis

**Diretrizes de Componentes**
```typescript
// Good: Proper TypeScript component
interface ButtonProps {
  variant?: 'default' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  onClick?: () => void
}

export function Button({ variant = 'default', size = 'md', children, onClick }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md',
        buttonVariants({ variant, size })
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

**Diretrizes de Estilização**
- Utilizar classes utilitárias do Tailwind CSS
- Seguir os padrões de componentes existentes
- Garantir compatibilidade com modo escuro
- Testar design responsivo
- Utilizar variáveis CSS para tematização

**Formatação de Código**
```bash
# Run formatting before commits
pnpm lint
pnpm format

# Auto-fix issues where possible
pnpm lint:fix
```

### Requisitos de Dupla Versão

**CRÍTICO: Ambas as Versões Devem Funcionar**

Todas as alterações devem ser compatíveis com ambas as versões (Vite e Next.js):

**Requisitos para Componentes de Cliente**
- Utilizar sempre `"use client"` para componentes interativos
- Testar componentes em ambas as frameworks
- Evitar APIs específicas de uma única framework

**Padrões Multi-plataforma**
```typescript
//  Good: Works in both frameworks
"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <Button onClick={() => setCount(count + 1)}>
      Count: {count}
    </Button>
  )
}

//  Bad: Next.js specific
import { useRouter } from 'next/router'  // Won't work in Vite

//  Bad: Missing "use client"
import { useState } from 'react'  // Will break in Next.js without "use client"
```

### Requisitos de Testes

**Testes Manuais**
- Testar em ambas as versões (Vite e Next.js)
- Verificar modos claro e escuro
- Verificar design responsivo
- Testar todas as funcionalidades interativas
- Garantir conformidade com acessibilidade

**Testes de Build**
```bash
# Test Vite build
cd vite-version
pnpm build && pnpm preview

# Test Next.js build
cd nextjs-version
pnpm build && pnpm start
```

**Testes em Navegadores**
- Chrome/Chromium
- Firefox
- Safari (se possível)
- Navegadores móveis

## Processo de Contribuição

### 1. Discussão de Issues

**Para Alterações Grandes**
- Crie ou comente numa issue no GitHub
- Discuta a abordagem e a implementação
- Obtenha feedback antes de iniciar o trabalho
- Garanta o alinhamento com os objetivos do projeto

**Para Alterações Pequenas**
- Correções de bugs e erros de digitação podem dispensar discussão
- Pequenas melhorias podem ser submetidas diretamente
- Documente a alteração na descrição do seu PR

### 2. Desenvolvimento de Código

**Lista de Verificação de Desenvolvimento**
- [ ] Código segue os padrões de TypeScript
- [ ] Componentes funcionam tanto em Vite como em Next.js
- [ ] Estilos seguem as convenções do Tailwind
- [ ] Compatibilidade com modo escuro verificada
- [ ] Design responsivo testado
- [ ] Acessibilidade considerada
- [ ] Sem erros ou avisos na consola

**Organização de Ficheiros**
- Seguir a estrutura de projeto existente
- Colocar ficheiros nas diretorias adequadas
- Atualizar ambas as versões quando necessário
- Colocalizar ficheiros relacionados

### 3. Diretrizes de Commit

**Formato da Mensagem de Commit**
```bash
type(scope): description

# Examples:
feat(components): add data table pagination
fix(theme): resolve dark mode toggle issue
docs(guide): update installation instructions
refactor(layout): simplify sidebar component
perf(charts): optimize chart rendering
```

**Tipos de Commit**
- `feat` - Novas funcionalidades
- `fix` - Correção de bugs
- `docs` - Alterações na documentação
- `style` - Estilo/formatação de código
- `refactor` - Refatoração de código
- `perf` - Melhorias de desempenho
- `test` - Alterações nos testes
- `chore` - Alterações em builds/ferramentas

### 4. Pull Request

**Antes de Submeter**
```bash
# Ensure code quality
pnpm lint
pnpm type-check

# Test builds
pnpm build

# Update documentation if needed
```

**Template de Descrição de PR**
```markdown
## Descrição
Breve descrição das alterações efetuadas.

## Tipo de Alteração
- [ ] Correção de bug
- [ ] Nova funcionalidade
- [ ] Atualização de documentação
- [ ] Melhoria de desempenho
- [ ] Refatoração

## Testes
- [ ] Testado na versão Vite
- [ ] Testado na versão Next.js
- [ ] Compatibilidade com modo escuro verificada
- [ ] Design responsivo verificado
- [ ] Sem erros na consola

## Capturas de Ecrã (Screenshots)
Inclua capturas de ecrã para alterações na UI.

## Notas Adicionais
Qualquer contexto ou considerações adicionais.
```

**Diretrizes de PR**
- Mantenha as alterações focadas e atómicas
- Escreva títulos claros e descritivos
- Referencie issues relacionadas
- Inclua capturas de ecrã para alterações visuais
- Documente alterações incompatíveis (breaking changes)

## Processo de Revisão de Código

### Critérios de Revisão

**Funcionalidade**
- O código funciona como pretendido
- Sem regressões introduzidas
- Casos limite considerados
- Tratamento de erros implementado

**Qualidade do Código**
- Boas práticas de TypeScript
- Código limpo e legível
- Abstrações adequadas
- Considerações de desempenho

**Consistência de Design**
- Segue os padrões existentes
- Consistência de UI/UX
- Conformidade com acessibilidade
- Responsividade móvel

### Diretrizes para Revisores

**Para Revisores**
- Seja construtivo e prestável
- Sugira melhorias, não apenas problemas
- Teste alterações localmente quando possível
- Considere a manutenibilidade e escalabilidade

**Para Contribuidores**
- Responda ao feedback atempadamente
- Faça perguntas quando não estiver claro
- Atualize com base nas sugestões
- Esteja aberto a melhorias iterativas

## Diretrizes da Comunidade

### Código de Conduta

**Seja Respeitoso**
- Trate todos os contribuidores com respeito
- Valorize perspetivas diversas
- Forneça feedback construtivo
- Ajude outros a aprender e crescer

**Seja Profissional**
- Mantenha as discussões focadas e relevantes
- Evite ataques pessoais ou assédio
- Respeite as decisões dos mantenedores do projeto
- Siga os padrões da comunidade

### Comunicação

**GitHub Discussions**
- Perguntas gerais e ideias
- Discussões de funcionalidades
- Demonstração da comunidade
- Ajuda e suporte

**GitHub Issues**
- Relatórios de bugs
- Pedidos de funcionalidades
- Problemas específicos
- Acompanhamento de tarefas

**Comunidade Discord**
- Chat e ajuda em tempo real
- Perguntas rápidas
- Interação comunitária
- Anúncios

## Reconhecimento

### Contribuidores

Todos os contribuidores são reconhecidos em:
- Lista de contribuidores do GitHub
- Documentação do projeto
- Notas de lançamento (release notes)
- Demonstrações da comunidade

### Níveis de Contribuição

**Contribuidores de Primeira Viagem**
- Boas-vindas e orientação fornecidas
- Issues para iniciantes identificadas com a etiqueta "good first issue"
- Mentoria disponível
- Melhorias na documentação incentivadas

**Contribuidores Regulares**
- Privilégios de revisão aumentados
- Participação na discussão de funcionalidades
- Participação em eventos da comunidade
- Reconhecimento especial

**Contribuidores Principais (Core)**
- Permissões de repositório
- Participação em lançamentos
- Contribuição para a visão do projeto (roadmap)
- Responsabilidades de manutenção

## Recursos

### Documentação
- [Estrutura do Projeto](/guide/project-structure) - Compreender a organização da base de código
- [Stack Tecnológico](/guide/tech-stack) - Conhecer as tecnologias utilizadas
- [Sistema de Temas](/guide/theme-system) - Compreender a arquitetura do sistema de temas

### Ferramentas e Extensões
- [VS Code](https://code.visualstudio.com/) - Editor recomendado
- [TypeScript](https://www.typescriptlang.org/) - Documentação da linguagem
- [Tailwind CSS](https://tailwindcss.com/) - Framework de estilização
- [shadcn/ui](https://ui.shadcn.com/) - Biblioteca de componentes

### Comunidade
- [Repositório GitHub](https://github.com/onsoft/shadcn-dashboard-landing-template)
- [Servidor Discord](https://discord.com/invite/XEQhPc9a6p)
- [SIGA Plus](https://portal-siga.com) - Componentes e templates premium

## Obter Ajuda

### Precisa de Assistência?

**Ajuda Técnica**
- Verifique a documentação existente
- Pesquise em issues e discussões do GitHub
- Faça perguntas no Discord
- Crie relatórios detalhados de issues

**Perguntas de Contribuição**
- Junte-se ao canal #contributors no Discord
- Comente em issues relevantes do GitHub
- Envie um e-mail para [contribute@portal-siga.com](mailto:contribute@portal-siga.com)
- Identifique os mantenedores nas discussões

---

Obrigado por contribuir para o Template SIGA Plus! As suas contribuições ajudam a tornar este projeto melhor para todos.
