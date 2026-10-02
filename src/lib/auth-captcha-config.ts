/**
 * Chave do site do hCaptcha, lida num sítio só.
 *
 * O projecto Supabase pode ter `security_captcha_enabled`; quando tem, o `/auth/v1/token`
 * recusa antes de olhar para as credenciais se o pedido não trouxer sinal. A chave é
 * pública (vai no bundle) e tem de fazer par com o segredo guardado no Supabase.
 *
 * Fica fora do componente para que o `AuthCaptcha.tsx` só exporte o componente — o
 * `react-refresh` avisa quando um ficheiro de componente exporta mais do que isso.
 */
export const AUTH_CAPTCHA_SITE_KEY = import.meta.env["VITE_HCAPTCHA_SITE_KEY"] as
  string | undefined;

export const authCaptchaConfigured = Boolean(AUTH_CAPTCHA_SITE_KEY);
