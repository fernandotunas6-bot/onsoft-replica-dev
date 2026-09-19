# Visão Geral do SIGA Plus

Ecossistema proprietário de gestão escolar angolana: **WEB** vende, **ADMIN** controla SaaS, **SIGA** opera a escola, **PAYFLOW** cobra, **DOC** explica (este site).

```text
WEB vende · ADMIN controla · SIGA trabalha · PAYFLOW cobra · DOC explica
```

---

## As cinco aplicações

| App | Função |
| --- | --- |
| **WEB** | Landing, planos, wizard `/start` para criar escola |
| **ADMIN** | Tenants, subscrições, domínios, operadores SaaS |
| **SIGA** | Alunos, pedagógica, tesouraria, documentos, catracas |
| **PAYFLOW** | Pagamentos, recibos e conciliação escolar |
| **DOC** | Manuais e arquitectura |

- [Arquitetura do ecossistema](/arquitetura/)
- [Navegação SIGA (mapa de módulos)](/siga/navegacao)
- [Control Center ADMIN](/admin/control-center)
- [Criar escola (WEB)](/web/criar-escola)

---

## O que o SIGA cobre

- Dashboard e portais por papel (admin, secretaria, tesouraria, professor, encarregado, aluno)
- Matrículas internas e candidatura pública `/matricula/{slug}`
- Área pedagógica: turmas, notas, horários, presenças, relatórios académicos
- Tesouraria: caixa, faturas, planos de pagamento, gateway Multicaixa/Unitel
- Documentos oficiais, biblioteca de arquivos, importação Excel/CSV
- Comunicações, calendário ICS, catracas e cartão virtual
- Definições: escola, matrícula, integrações catalog-ready, segurança (2FA)

Detalhe de módulos e RBAC: [Funcionalidades & permissões](/guide/features).

---

## Navegação na documentação

### Ecossistema
- **[Visão geral](/arquitetura/)** — WEB, ADMIN, SIGA, DOC
- **[Responsabilidades](/arquitetura/responsabilidades)**
- **[Fluxos e provisionamento](/arquitetura/fluxos)**

### SIGA escolar
- **[Navegação e permissões](/siga/navegacao)**
- **[Funcionalidades](/guide/features)**

### Primeiros passos
- **[Instalação](/guide/installation)** — SQL SGA, env, arranque local
- **[Estrutura do projecto](/guide/project-structure)**

### Integrações & financeiro
- **[Integrações](/integracoes/)**
- **[SAFT-AO / AGT](/financeiro/saft-agt-exportacao)**

### Template DOC (UI libraries)
- **[Componentes](/components/)** · **[Temas](/theme-customizer/)** · **[Vite](/vite/)** · **[Next.js](/nextjs/)**

---

## Desenvolvimento local

```sh
npm run dev:ecosystem   # WEB + ADMIN + SIGA + DOC
npm run siga:check      # inventário + testes de navegação
```

Stack SIGA: TanStack Start, React 19, Supabase SGA, Zod. Ver [Pilha tecnológica](/guide/tech-stack).
