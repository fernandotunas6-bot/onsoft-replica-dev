-- Área 8 do checklist ("SMS, WhatsApp e notificações push apenas quando os canais
-- estiverem integrados"): o canal "sms" de school_announcements despachava, de facto,
-- por WhatsApp Cloud API (comunicacoes.tsx chamava sendSchoolWhatsAppMessage quando
-- channel === "sms") -- rótulo enganoso, um director via "SMS" e recebia WhatsApp (ou um
-- link wa.me, ou nada, consoante a configuração). Corrigido no código: "sms" passa a
-- despachar por Twilio de facto (features/integrations/sms-client.ts + sendSchoolSmsMessage),
-- e "whatsapp" fica como opção própria.
--
-- Esta migração só acrescenta 'whatsapp' à lista aceite pela constraint -- não remove
-- nenhum valor existente, não migra dados.

BEGIN;

ALTER TABLE public.school_announcements DROP CONSTRAINT school_announcements_channel_check;
ALTER TABLE public.school_announcements
  ADD CONSTRAINT school_announcements_channel_check
  CHECK (channel IN ('sms', 'whatsapp', 'email', 'portal'));

COMMIT;

NOTIFY pgrst, 'reload schema';
