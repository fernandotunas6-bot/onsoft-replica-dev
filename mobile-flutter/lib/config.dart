/// Configuração pública deste build.
///
/// Nada aqui é segredo: a chave do hCaptcha é a do site e as portas dizem
/// apenas se o Worker servido já monta o endpoint correspondente. Enquanto não
/// montar, a aplicação não oferece o caminho — um botão que devolve 404 na mão
/// de quem o usa é pior do que a ausência do botão.
library;

/// Chave pública do hCaptcha, par da que o portal lê em VITE_HCAPTCHA_SITE_KEY.
const captchaSiteKey = String.fromEnvironment('HCAPTCHA_SITE_KEY');

/// `POST /api/mobile-v4/auth/identifier` (backend/identity.ts).
const identifierLoginEnabled = bool.fromEnvironment('IDENTIFIER_LOGIN');

/// `GET .../notices` e `.../results` (backend/records.ts).
const institutionalRecordsEnabled = bool.fromEnvironment(
  'INSTITUTIONAL_RECORDS',
);

/// `GET .../chat/threads/:threadId` (backend/chat.ts). Só leitura: o envio
/// depende de endpoints de escrita que não existem nesta cópia do repositório.
const chatHistoryEnabled = bool.fromEnvironment('INSTITUTIONAL_CHAT');
