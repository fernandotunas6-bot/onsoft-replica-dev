# Sistema de Temas

Personalização de temas em tempo real com suporte integrado tweakcn.

## Visão Geral Rápida

O template inclui um **sistema completo de personalização de temas** que permite:

- **Edição de temas ao vivo** com pré-visualização instantânea
- **Personalização de esquemas de cores** com seletor de cores HSL
- **Configuração de layout** (posição da barra lateral, largura, cabeçalhos)
- **Modo escuro/claro (Dark/light mode)** com deteção das preferências do sistema
- **Exportação/importação** de configurações de temas
- **Sistema de temas baseado em variáveis CSS**

## Personalizador de Temas

Aceda através do **ícone de engrenagem** no cabeçalho para personalizar:

### Cores
- Cores primárias, secundárias e de destaque (accent)
- Variantes de fundo (background) e primeiro plano (foreground)
- Tons de borda e atenuados (muted)
- Cores de ações destrutivas

### Layout
- Posição da barra lateral (esquerda/direita)
- Largura e comportamento da barra lateral
- Estilos e posicionamento do cabeçalho
- Espaçamento de conteúdo e tipografia

### Modos
- Alternador de modo claro/escuro
- Deteção das preferências do sistema
- Alternância automática de temas

## Implementação Técnica

**Variáveis CSS**
```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  /* ... */
}
```

**Hook do React**
```typescript
const [config, setConfig] = useTheme()
```

**Componente do Personalizador**
```tsx
<ThemeCustomizer />
```

## Integração

O sistema de temas funciona através de:
- **Propriedades personalizadas CSS** para todas as cores e espaçamentos
- **Classes Tailwind CSS** que referenciam variáveis CSS
- **React Context** para gestão do estado do tema
- **Armazenamento local (Local storage)** para persistência

---

Para detalhes de implementação, consulte a documentação do [Personalizador de Temas](/theme-customizer/).
