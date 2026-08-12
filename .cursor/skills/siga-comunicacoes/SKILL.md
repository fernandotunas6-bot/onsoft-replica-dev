---
name: siga-comunicacoes
description: >-
  Extends SIGA school announcements and communications. Use when editing
  /comunicacoes or src/features/communications.
---

# SIGA · Comunicações

- Rota: `src/routes/comunicacoes.tsx`
- Domínio: `src/features/communications/{schemas,server}.ts`
- Testes: `tests/communications/schemas.test.ts`
- Acesso: pedagógica (Admin/Secretaria/Professor)

Estender anuncios SGA existentes. SMS/email externos só via catálogo (`siga-integracoes`), não inventar envio.

Mensagens internas entre contas da mesma escola: painel da conta (`AccountDrawer`) → avatares dos mais acedidos + `+` (pesquisa por nome/cargo). A conversa fica no mesmo painel; Sair só no menu. Não-lidas: ponto nos avatares, contador no cabeçalho e lista no sino. Domínio `src/features/messages/`. Tabela `siga_direct_messages` no `APPLY_ENROLLMENT_AND_PREMIUM.sql`; sem tabela, a conversa fica neste dispositivo e actualiza a cada 8 s quando o SGA existe.

Comunicados `published` também aparecem no dashboard (`getDashboardOverview.announcements`). Com integrações: WhatsApp, Resend, Zoom e Outlook (M365) nos cartões; o dashboard também partilha WhatsApp/Resend.

Admin/Secretaria **edita** o texto (`updateSchoolAnnouncement`) e **arquiva** (`archiveSchoolAnnouncement` → `archived`). Arquivados saem do dashboard e podem **Republicar** (`sent`/`published`). Lista tem CSV, PDF, **Oficial** e **Imprimir** no comunicado (modelo `service-document`). No formulário, **Anexar arquivo** acrescenta referência `[Arquivo SIGA] nome` à mensagem (biblioteca Moodle).
