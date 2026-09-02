# Suporte

Obtenha ajuda com o template SIGA Plus.

## Ajuda Rápida

### Documentação
- **[Guia de Instalação](/guide/installation)** - Instruções de configuração
- **[Componentes](/components/)** - Biblioteca de componentes
- **[Sistema de Temas](/guide/theme-system)** - Opções de personalização
- **[Estrutura do Projeto](/guide/project-structure)** - Organização do código

### Problemas Comuns

**Erros de Build**
- Verifique a versão do Node.js (18+ necessário)
- Limpe a pasta `node_modules` e reinstale: `rm -rf node_modules pnpm-lock.yaml && pnpm install`
- Verifique a configuração do TypeScript

**Tema Não Funciona**
- Garanta que as variáveis CSS estão devidamente importadas
- Verifique as diretivas `"use client"` dos componentes
- Verifique o wrapper do provedor de tema (theme provider)

**Problemas com Componentes**
- Atualize para a versão mais recente do shadcn/ui
- Verifique os caminhos de importação e aliases
- Garanta tipos de TypeScript adequados

## Suporte da Comunidade

### GitHub
- **[Issues](https://github.com/onsoft/shadcn-dashboard-template/issues)** - Relatórios de bugs
- **[Discussions](https://github.com/onsoft/shadcn-dashboard-template/discussions)** - Perguntas
- **[Wiki](https://github.com/onsoft/shadcn-dashboard-template/wiki)** - Guias

### Discord
Junte-se à nossa comunidade para obter ajuda em tempo real:
- [Servidor Discord](https://discord.com/invite/XEQhPc9a6p) (se disponível)

### Redes Sociais
- **Twitter**: [@SIGA Plus](https://twitter.com/SIGA Plus)
- **LinkedIn**: [SiliconDeck](https://linkedin.com/company/onsoft)

## Suporte Comercial

Para suporte prioritário e desenvolvimento personalizado:
- **E-mail**: [support@portal-siga.com](mailto:support@portal-siga.com)
- **Desenvolvimento Personalizado** - Soluções à medida
- **Correções de Bugs Prioritárias** - Resolução rápida de problemas
- **Formação & Consultoria** - Integração e preparação da equipa (onboarding)

## Relatórios de Bugs

Ao reportar bugs, inclua:
1. **Descrição** do problema
2. **Passos para reproduzir** o problema
3. Comportamento **esperado** vs **atual**
4. Detalhes do **ambiente** (SO, navegador, versões)
5. **Capturas de ecrã (screenshots)** ou mensagens de erro

## Pedidos de Funcionalidades

Sugira novas funcionalidades através de:
- [GitHub Discussions](https://github.com/onsoft/shadcn-dashboard-template/discussions)
- Votação da comunidade nas prioridades
- Descrições detalhadas dos casos de uso

---

Estamos aqui para o ajudar a alcançar o sucesso com o template!
Sugira melhorias e novas funcionalidades:
- Consulte primeiro as discussões existentes
- Explique o caso de uso e os benefícios
- Considere a complexidade da implementação
- Forneça maquetes (mockups) ou exemplos, se for útil

## Perguntas Frequentes (FAQ)

### Instalação & Configuração

**P: Qual versão devo escolher - Vite ou Next.js?**
R: Escolha com base nas necessidades do seu projeto:
- **Vite**: Desenvolvimento SPA rápido, roteamento no lado do cliente, alojamento/implantação mais simples
- **Next.js**: Otimização de SEO, renderização no lado do servidor, capacidades full-stack

**P: Posso utilizar ambas as versões no mesmo projeto?**
R: Não, escolha uma versão. Ambas fornecem componentes UI e funcionalidades idênticas, mas com arquiteturas diferentes.

**P: Qual é a versão do Node.js necessária?**
R: É necessário o Node.js 18+. O Node.js 20+ é recomendado para obter o melhor desempenho.

### Desenvolvimento

**P: Como adiciono uma nova página?**
R: 
1. Crie uma nova diretoria em `src/app/`
2. Adicione um ficheiro `page.tsx` com o seu componente
3. Atualize a navegação em `app-sidebar.tsx`
4. Para Vite: Adicione a rota em `App.tsx`

**P: Como personalizo o tema?**
R: Utilize o personalizador de temas integrado:
1. Clique no botão do personalizador de temas
2. Ajuste as cores e as opções de layout
3. Exporte a sua configuração de tema
4. Aplique à sua build de produção

**P: Posso remover o personalizador de temas?**
R: Sim, consulte o guia [Remover o Personalizador](/theme-customizer/removing-customizer) para obter instruções.

### Componentes & Estilização

**P: Como adiciono novos componentes shadcn/ui?**
R: Utilize a CLI do shadcn/ui:
```bash
npx shadcn@latest add button
npx shadcn@latest add card
```

**P: Como personalizo os estilos dos componentes?**
R: Modifique os ficheiros de componentes em `src/components/ui/` ou crie variantes personalizadas utilizando class-variance-authority.

**P: Como lido com o design responsivo?**
R: Utilize os prefixos responsivos do Tailwind CSS:
```tsx
<div className="px-4 md:px-6 lg:px-8">
  Content
</div>
```

### Implantação / Alojamento

**P: Como faço a implantação da versão Vite?**
R: 
1. Execute `pnpm build`
2. Implante a pasta `dist/` em qualquer alojamento estático
3. Recomendado: Netlify, Vercel ou AWS S3

**P: Como faço a implantação da versão Next.js?**
R:
1. Execute `pnpm build`
2. Implante na Vercel (recomendado) ou em qualquer alojamento Node.js
3. Configure as variáveis de ambiente conforme necessário

**P: Posso fazer a implantação no GitHub Pages?**
R: Sim, para a versão Vite. Configure o caminho base (base path) em `vite.config.ts` para implantação no GitHub Pages.

### Resolução de Problemas

**P: Estou a ter erros de TypeScript**
R: 
1. Verifique a versão do Node.js (18+)
2. Execute `pnpm install` para garantir as dependências
3. Reinicie o servidor TypeScript no seu editor
4. Verifique se existem definições de tipo em falta

**P: Os estilos não estão a carregar corretamente**
R:
1. Garanta que o Tailwind CSS está configurado corretamente
2. Verifique se o `globals.css` está importado
3. Verifique se as variáveis CSS estão definidas
4. Limpe a cache do navegador

**P: O personalizador de temas não está a funcionar**
R:
1. Verifique se o componente `ThemeCustomizer` está incluído
2. Verifique se as dependências do tweakcn estão instaladas
3. Garanta que as variáveis CSS estão configuradas corretamente
4. Verifique se existem erros na consola do navegador

## Suporte Profissional

### Suporte Premium SIGA Plus

Para clientes enterprise e implementações complexas:

**O Suporte Premium Inclui:**
- Suporte prioritário por e-mail
- Sessões de consultoria por vídeo
- Desenvolvimento de componentes personalizados
- Assistência avançada de integração
- Ajuda na otimização de desempenho

**Opções de Contacto:**
- E-mail: [support@portal-siga.com](mailto:support@portal-siga.com)
- Enterprise: [enterprise@portal-siga.com](mailto:enterprise@portal-siga.com)

### Serviços de Consultoria

**Serviços Disponíveis:**
- Desenvolvimento de dashboards personalizados
- Criação de bibliotecas de componentes
- Otimização de desempenho
- Assistência na migração
- Formação e workshops

**Obter um Orçamento:**
Contacte-nos através de [consulting@portal-siga.com](mailto:consulting@portal-siga.com) com os requisitos do seu projeto.

## Recursos de Aprendizagem

### Tutoriais em Vídeo

**Canal do YouTube**
Subscreva o nosso canal para tutoriais em vídeo:
- Guias de configuração e instalação
- Tutoriais de personalização de componentes
- Técnicas avançadas de temas
- Exemplos de implementação no mundo real

[YouTube SIGA Plus](https://youtube.com/@SIGA Plus)

### Artigos de Blog

**Blog Técnico**
Leia artigos aprofundados sobre:
- Padrões de design de dashboards
- Boas práticas de componentes React
- Técnicas de otimização de desempenho
- Tendências modernas de UI/UX

[Blog SIGA Plus](https://portal-siga.com/blog)

### Projetos de Exemplo

**Aplicações de Demonstração**
Explore implementações do mundo real:
- Dashboards de comércio eletrónico
- Interfaces de aplicações SaaS
- Sistemas de gestão de conteúdos (CMS)
- Dashboards analíticos

[Ver Exemplos](https://portal-siga.com/examples)

## Contribuir para o Suporte

### Ajudar a Comunidade

**Partilhar Conhecimento**
- Responda a perguntas no Discord
- Contribua para as discussões no GitHub
- Escreva tutoriais e guias
- Partilhe as suas implementações

**Melhorar a Documentação**
- Corrija erros de digitação e lapsos
- Adicione informação em falta
- Crie novos guias
- Traduza a documentação

### Torne-se um Moderador da Comunidade

Ajude-nos a manter uma comunidade prestável e acolhedora:
- Modere os canais do Discord
- Revise e responda a perguntas
- Ajude os novos membros a começar
- Organize eventos comunitários

Contacte [community@portal-siga.com](mailto:community@portal-siga.com) se estiver interessado.

## Informações de Contacto

### Contacto Direto

**Perguntas Gerais**
[hello@portal-siga.com](mailto:hello@portal-siga.com)

**Suporte Técnico**
[support@portal-siga.com](mailto:support@portal-siga.com)

**Perguntas Comerciais**
[business@portal-siga.com](mailto:business@portal-siga.com)

**Problemas de Segurança**
[security@portal-siga.com](mailto:security@portal-siga.com)

### Redes Sociais

**Mantenha-se Conectado**
- Twitter: [@SIGA Plus](https://twitter.com/SIGA Plus)
- LinkedIn: [SIGA Plus](https://linkedin.com/company/SIGA Plus)
- GitHub: [onsoft](https://github.com/onsoft)

### Tempos de Resposta

**Suporte da Comunidade**
- Discord: Geralmente em poucas horas
- GitHub: 1-3 dias úteis
- E-mail: 2-5 dias úteis

**Suporte Premium**
- E-mail: Em 24 horas
- Chamadas de vídeo: Em 48 horas
- Enterprise: No próprio dia útil

## Feedback

### Ajude-nos a Melhorar

**Feedback sobre a Documentação**
Encontrou algo pouco claro ou em falta? Informe-nos:
- Crie issues no GitHub para problemas de documentação
- Sugira melhorias no Discord
- Envie feedback por e-mail para [docs@portal-siga.com](mailto:docs@portal-siga.com)

**Feedback sobre o Produto**
Ajude-nos a tornar o template ainda melhor:
- Avalie o template no GitHub
- Partilhe casos de sucesso
- Sugira novas funcionalidades
- Reporte problemas de usabilidade

**Feedback sobre a Comunidade**
Como podemos melhorar a experiência da comunidade?
- Sugira novos canais no Discord
- Proponha eventos comunitários
- Partilhe ideias para tutoriais
- Recomende oradores convidados

## Casos de Sucesso

### Demonstração da Comunidade

**Construído com SIGA Plus**
Veja o que outros criaram:
- Aplicações SaaS
- Plataformas de comércio eletrónico
- Ferramentas internas
- Websites de portefólio

Partilhe o seu projeto no Discord ou identifique-nos nas redes sociais!

### Testemunhos de Clientes

*"O template SIGA Plus poupou-nos meses de tempo de desenvolvimento. A qualidade do código é excelente e a documentação é abrangente."*
- **Jane Smith**, Programadora Principal na TechCorp

*"Template fantástico com excelente suporte comunitário. O personalizador de temas mudou totalmente a forma como desenvolvemos projetos para os nossos clientes."*
- **Mike Johnson**, Programador Freelancer

---

**Precisa de ajuda?** Não hesite em entrar em contacto. A nossa comunidade e equipa estão aqui para o ajudar a alcançar o sucesso com o Template SIGA Plus!
