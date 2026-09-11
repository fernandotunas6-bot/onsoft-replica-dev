// OTP Webhook Handlers — Recebem status de entrega dos provedores
export {
  handleTwilioSmsWebhook,
  verifyTwilioWebhookSignature,
  type TwilioWebhookPayload,
} from "./twilio-webhook-handler";

export {
  handleWhatsAppWebhook,
  verifyMetaWebhookSignature,
  type MetaWebhookEvent,
} from "./whatsapp-webhook-handler";
