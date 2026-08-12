---
name: siga-matricula
description: >-
  Extends SIGA public enrollment campaign and /matricula/$slug. Use when
  editing enrollment forms, candidaturas, or EnrollmentCampaignPanel.
---

# SIGA · Matrícula pública

- Rota pública: `src/routes/matricula/$slug.tsx` (fora do AuthGate)
- Painel: Settings → `EnrollmentCampaignPanel`
- Domínio: `src/features/enrollment/{schemas,server}.ts`
- Testes: `tests/enrollment/schemas.test.ts`
- Path público: `src/lib/public-paths.ts`

## Regras

1. Precisa de `APPLY_ENROLLMENT_AND_PREMIUM.sql` (`enrollment_forms`, `enrollment_applications`).
2. Sem tabela: erro aponta esse SQL — não criar schema Lovable.
3. Aceitar candidatura cria pessoa + aluno SGA (processo `CAND-…`). Se o payload tiver `guardianName`, cria o encarregado e liga em `student_guardians`. Com `classGroupId` cria matrícula activa na turma; sem turma fica `applicant`. Coluna `student_id` no SQL APPLY. NIF/BI da candidatura é validado no submit público; ao aceitar, normaliza `national_id` e regista `person_documents` quando for BI.
4. Anon pode INSERT candidatura se o form `is_open`.
5. Após enviar, o candidato pode **Imprimir talão** (`talao-candidatura.hbs` público). Na secretaria, **Talão** (e após Aceitar) usa o modelo activo da escola. O painel de campanha tem atalho **Modelos de impressão** (`/documentos#modelos`) e toolbar `documentos` (Resend).
6. Se WhatsApp Business estiver instalado, a página pública mostra **WhatsApp da secretaria** (`publicSchoolPhone`). Com Resend instalado, **E-mail da secretaria** (`publicSchoolEmail`). O painel interno partilha o link com WhatsApp e copia texto Resend. Cada candidatura tem **WhatsApp**/**E-mail** para o telefone do encarregado ou do candidato.
