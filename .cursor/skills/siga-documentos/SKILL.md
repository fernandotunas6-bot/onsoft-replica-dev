---
name: siga-documentos
description: >-
  Extends SIGA document requests and issuance. Use when editing /documentos
  or src/features/documents.
---

# SIGA · Documentos

- Rota: `src/routes/documentos.tsx`
- Domínio: `src/features/documents/{schemas,server}.ts`
- Acesso: módulo `pessoas` (Admin/Secretaria)

Estender o fluxo existente (`document_requests` / templates SGA). Filtros persistentes já na página. Não criar um segundo módulo de emissão.

Emitir (`approved`) renderiza o modelo `.hbs` activo de `public/templates` (pré-visualizar / editar / **Usar**). O cartão mostra o modelo por defeito e o `type` associado. Atalho em Definições → Escola → secção **Atalhos** → Modelos de impressão; toolbar `InstalledModuleTools module="documentos"` na mesma página. Se falhar, cai no PDF `exportOfficialDeclarationPdf` + `officialDeclarationBody`. Pedidos já emitidos voltam a descarregar com o botão **PDF**. Pedidos em curso têm **Recusar** (`rejected`) e **Cancelar** (`cancelled`). A lista filtrada tem CSV, PDF e **Oficial** (`service-document`). Com Resend/WhatsApp: avisar o encarregado no pedido em curso e no emitido. `PrintTemplateStudio`: hint Resend + botão **E-mail Resend** na pré-visualização do modelo.

Modelos oficiais: `public/templates/*.hbs` + `template-registry.json`. Overrides e modelo activo ficam em `school_settings.domain = print_templates` (parser em `print-settings.ts`). Não adicionar o pacote Handlebars — o renderer está em `render-hbs.ts`. Emissão partilhada: `issuePrintDocument` (ficha do aluno, pedagógica, pauta na grelha, tesouraria/recibos, listas institucionais, comunicados, calendário, credenciais, relatórios, talões).
