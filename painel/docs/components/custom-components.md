# Componentes do SIGA Plus

Esta página é uma referência para quem mantém a interface da aplicação escolar em
`src/components`. Não é uma biblioteca partilhada entre as cinco aplicações do
ecossistema.

> [!IMPORTANT]
> WEB, ADMIN, SIGA, PAYFLOW e DOC preservam os seus próprios frontends. Não copie estes
> componentes para outra aplicação apenas para uniformizar o aspecto. Código partilhado
> entre aplicações deve limitar-se a contratos, schemas e clientes de API.

## Estrutura principal

As páginas autenticadas são montadas pelo `AppShell`. Ele coordena a barra lateral, a
barra superior, o lançador de aplicações, as definições e as acções contextuais. Uma rota
normal fornece apenas o conteúdo da página:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/exemplo")({
  component: ExemploPage,
});

function ExemploPage() {
  return (
    <AppShell>
      <div className="space-y-4">Conteúdo</div>
    </AppShell>
  );
}
```

Não replique navegação, perfil, tema ou selecção de escola dentro de uma rota. Essas
responsabilidades pertencem ao shell e ao contexto de tenant.

## Cabeçalho de página

`PageHeader` padroniza breadcrumb, grupo, título, descrição, marca e acções. Se a página
tiver um artigo no DOC, coloque `DocPathHelpButton` nas acções.

```tsx
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { DocPathHelpButton } from "@/components/ui/doc-help-button";

<PageHeader
  group="Secretaria"
  title="Documentos"
  description="Pedidos, emissão e entrega de documentos escolares."
  icon={FileText}
  actions={
    <>
      <DocPathHelpButton path="/siga/navegacao.html" />
      <Button size="sm">
        <Plus className="size-4" /> Novo pedido
      </Button>
    </>
  }
/>;
```

Por omissão, o breadcrumb é `Início → grupo → título`. Use `crumbs` quando a hierarquia
real for diferente e `hideBreadcrumb` apenas em superfícies que já forneçam esse contexto.

## Painéis e indicadores

`Panel`, `StatGrid` e `StatCard` cobrem os padrões mais comuns de resumo. Eles já aplicam
espaçamento, cores semânticas e comportamento responsivo.

```tsx
import { GraduationCap } from "lucide-react"
import { Panel, StatGrid } from "@/components/layout/PageHeader"
import { StatCard } from "@/components/ui/stat-card"

<StatGrid>
  <StatCard
    title="Alunos activos"
    value="428"
    subtitle="Ano lectivo actual"
    icon={GraduationCap}
    tone="success"
    to="/alunos"
  />
</StatGrid>

<Panel
  title="Pedidos recentes"
  description="Últimos pedidos recebidos pela secretaria."
  icon={GraduationCap}
>
  {/* tabela ou conteúdo */}
</Panel>
```

`StatGrid` também aceita `items`. Quando usar `collapsible`, forneça um `storageKey`
estável e exclusivo da página.

## Tabelas, filtros e paginação

Uma listagem completa combina três peças:

- `ListFilterBar` para pesquisa, selects, datas e filtros activos;
- `DataTableShell` para cabeçalho, área com deslocamento horizontal e rodapé;
- `ListPaginationBar` para intervalo visível, tamanho de página e navegação.

```tsx
import { ListFilterBar } from "@/components/filters/ListFilterBar"
import { ListPaginationBar } from "@/components/filters/ListPaginationBar"
import { DataTableShell } from "@/components/ui/data-table-shell"

<ListFilterBar
  fields={[
    { name: "search", type: "search", placeholder: "Pesquisar aluno…" },
    {
      name: "status",
      type: "select",
      label: "Estado",
      options: [
        { value: "", label: "Todos" },
        { value: "active", label: "Activo" },
      ],
    },
  ]}
  values={filters}
  onChange={setFilter}
  onReset={resetFilters}
  activeCount={activeCount}
/>

<DataTableShell
  footer={
    <ListPaginationBar
      page={page}
      pageSize={pageSize}
      totalItems={total}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  }
>
  {/* Table */}
</DataTableShell>
```

A filtragem e a paginação são controladas pela página. Ao mudar um filtro ou o tamanho da
página, volte à primeira página para não deixar o utilizador num intervalo inexistente.

## Estados de uma superfície

Não deixe carregamento, ausência de dados ou schema incompleto parecerem a mesma coisa.

### Carregamento

Use `PageLoading` para carregamento de rota. Para blocos internos, prefira os `Skeleton`
do próprio conteúdo para evitar saltos de layout.

```tsx
import { PageLoading } from "@/components/ui/page-loading";

if (loading) return <PageLoading message="A carregar documentos…" />;
```

### Lista vazia

`EmptyState` deve explicar por que a área está vazia e, quando possível, oferecer a
próxima acção.

```tsx
import { FilePlus2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

<EmptyState
  icon={FilePlus2}
  title="Ainda não há pedidos"
  description="Crie o primeiro pedido de documento para este aluno."
  actionLabel="Novo pedido"
  onAction={openCreateDialog}
/>;
```

### Schema em falta

Quando o backend indicar uma tabela ausente, use `SchemaMissingBanner`. Ele aponta para a
ordem SQL canónica do SGA; não instrua o utilizador a aplicar migrações Lovable.

```tsx
import { isSchemaMissingError, SchemaMissingBanner } from "@/components/ui/schema-missing-banner";

if (isSchemaMissingError(error)) {
  return <SchemaMissingBanner description="O módulo de catracas ainda não está instalado." />;
}
```

## Estados de domínio

`StatusBadge` serve estados transversais já conhecidos, como `active`, `inactive`,
`pending`, `processing`, `paid`, `overdue`, `failed`, `cancelled` e `refunded`.

```tsx
import { StatusBadge } from "@/components/ui/status-badge"

<StatusBadge status="active" />
<StatusBadge status="pending" size="sm" showIcon={false} />
```

Para vocabulários específicos de um módulo, mantenha o mapeamento junto desse módulo. Não
force um estado académico ou documental a caber num estado financeiro só porque a cor é
parecida. A cor complementa o texto; nunca deve ser a única forma de distinguir estados.

## Ajuda contextual

Use os helpers de URL do ecossistema em vez de endereços de produção fixos:

```tsx
import {
  DocHelpButton,
  DocPathHelpButton,
  SqlDocHelpButton,
} from "@/components/ui/doc-help-button"

<DocHelpButton />
<DocPathHelpButton path="/siga/navegacao.html" label="Manual" />
<SqlDocHelpButton />
```

- `DocHelpButton` abre o mapa de navegação por omissão;
- `DocPathHelpButton` resolve um artigo por `getDocUrl`;
- `SqlDocHelpButton` abre directamente o checklist SQL SGA.

## Regras de composição

1. Reutilize primeiro um componente existente em `src/components/ui` ou
   `src/components/layout`.
2. Mantenha regras de negócio, consultas e mutações fora dos componentes visuais.
3. Use tokens do tema (`bg-card`, `text-muted-foreground`, `border-border`) em vez de
   cores soltas para superfícies genéricas.
4. Preserve foco visível, nomes acessíveis e elementos HTML semânticos.
5. Estados destrutivos exigem confirmação e feedback; não dependem apenas de um botão
   vermelho.
6. Componentes exclusivos de um módulo ficam junto da feature. Só promova para
   `src/components` quando houver reutilização real.

## Antes de concluir

Execute as verificações a partir da raiz:

```sh
npm run siga:check
```

Para alterações apenas no site DOC, valide também a construção VitePress:

```sh
cd painel/docs
npm run build
```

Consulte ainda a [estrutura do projecto](/guide/project-structure), o
[sistema de temas](/guide/theme-system) e as
[responsabilidades do ecossistema](/arquitetura/responsabilidades).
