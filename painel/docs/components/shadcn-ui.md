# Integração com shadcn/ui

O template vem com o shadcn/ui v3 pré-configurado e pronto a usar. Este guia cobre a configuração, a estrutura dos componentes e como adicionar novos componentes.

## Instalação

O template já possui o shadcn/ui v3 configurado. Para adicionar novos componentes:

```bash
# Adicionar componentes individuais
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add data-table

# Adicionar múltiplos componentes
npx shadcn@latest add button card input
```

## Configuração

A configuração do shadcn/ui está armazenada em `components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

## Componentes Disponíveis

### Componentes de Base de UI

Elementos fundamentais do shadcn/ui v3:

- **Button** - Vários estilos e estados de botões
- **Input** - Campos de texto, campos de pesquisa e controlos de formulário
- **Card** - Contentores de conteúdo e painéis
- **Badge** - Indicadores de estado e etiquetas
- **Avatar** - Imagens de perfil de utilizador e fallbacks
- **Dialog** - Janelas modais e sobreposições (overlays)
- **Dropdown Menu** - Menus de contexto e opções de seleção
- **Tabs** - Navegação por separadores de conteúdo
- **Sheet** - Painéis laterais e gavetas (drawers)
- **Tooltip** - Popups de informação contextual

### Componentes de Formulário

Solução completa de gestão de formulários:

- **Form** - Integração com React Hook Form
- **Select** - Menus suspensos de seleção avançada
- **Checkbox** - Inputs de caixa de seleção com estado indeterminado
- **Radio Group** - Grupos de botões de opção (radio buttons)
- **Switch** - Interruptores de alternância (toggles)
- **Textarea** - Campos de entrada de texto multilinha
- **Date Picker** - Seleção de data e hora

### Componentes de Exibição de Dados

- **Calendar** - Seletor de datas e exibição de eventos
- **Progress** - Barras e indicadores de progresso
- **Skeleton** - Placeholders de carregamento
- **Accordion** - Secções de conteúdo colapsáveis

### Componentes de Navegação

- **Breadcrumb** - Caminhos de navegação hierárquica
- **Pagination** - Controlos de navegação por páginas
- **Command** - Paleta de comandos para ações rápidas

## Estrutura dos Componentes

Todos os componentes do shadcn/ui seguem um padrão consistente:

```typescript
// Exemplo: Estrutura do componente Button
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

## Integração de Formulários

Integração do React Hook Form com validação de esquema:

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
})

function UserForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}
```

## Estilização e Personalização

### Variáveis CSS

Todos os componentes usam variáveis CSS para tematização:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222.2 84% 4.9%;
}
```

### Variantes de Componentes

Utilize o `class-variance-authority` para variantes de componentes:

```typescript
const cardVariants = cva(
  "rounded-lg border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "border-border",
        destructive: "border-destructive",
        outline: "border-2",
      },
      size: {
        default: "p-6",
        sm: "p-4",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

### Estilização Personalizada

Estenda os componentes com classes personalizadas:

```typescript
<Button 
  variant="outline" 
  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white"
>
  Custom Button
</Button>
```

## Acessibilidade

Todos os componentes do shadcn/ui seguem as melhores práticas de acessibilidade:

- **Navegação por Teclado** - Suporte completo por teclado
- **Suporte para Leitores de Ecrã** - Etiquetas ARIA e descrições adequadas
- **Gestão de Foco** - Ordem de foco lógica e indicadores de foco visíveis
- **Contraste de Cores** - Combinações de cores em conformidade com WCAG AA

## Desempenho

Os componentes estão otimizados para o máximo desempenho:

- **Tree Shaking** - Importe apenas o que utilizar
- **Lazy Loading** - Os componentes são carregados sob procura
- **Memorização** - React.memo para componentes pesados
- **Divisão de Código (Bundle Splitting)** - Divisão automática de código
