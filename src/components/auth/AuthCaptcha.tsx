import { useCallback, useEffect, useId, useRef } from "react";

/**
 * hCaptcha no formulário de autenticação.
 *
 * O projecto Supabase tem `security_captcha_enabled` com o fornecedor `hcaptcha`: o
 * `/auth/v1/token` recusa **antes** de olhar para as credenciais quando não vem
 * `captcha_token`, e devolve `captcha_failed`. Sem este campo, nenhum login por senha
 * funciona — nem pelo cliente, nem pelo `passwordGrant` do servidor.
 *
 * A chave do site (pública) vive em `VITE_HCAPTCHA_SITE_KEY` e tem de ser a que faz par
 * com o segredo guardado no Supabase. Sem ela o componente não rende nada e o pedido segue
 * sem sinal — o erro mapeado diz então que falta configurar, em vez de acusar a senha.
 */

const SITE_KEY = import.meta.env["VITE_HCAPTCHA_SITE_KEY"] as string | undefined;

type HCaptchaApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi;
  }
}

export const authCaptchaConfigured = Boolean(SITE_KEY);

let scriptPromise: Promise<void> | null = null;

function loadHCaptcha(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.hcaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.hcaptcha.com/1/api.js?render=explicit&onload=__sigaHcaptchaReady";
    script.async = true;
    script.defer = true;
    (window as unknown as Record<string, unknown>)["__sigaHcaptchaReady"] = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Não foi possível carregar o hCaptcha."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * O sinal é de uso único: depois de cada tentativa — falhada ou não — é preciso `reset`,
 * senão a segunda tentativa reenvia um sinal já gasto e volta a dar `captcha_failed`.
 */
export function AuthCaptcha({
  onToken,
  resetSignal,
}: {
  onToken: (token: string | null) => void;
  resetSignal: number;
}) {
  const containerId = useId();
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const mount = useCallback(async () => {
    if (!SITE_KEY || !containerRef.current || widgetIdRef.current) return;
    await loadHCaptcha();
    if (!window.hcaptcha || !containerRef.current) return;
    widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(null),
      "error-callback": () => onTokenRef.current(null),
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    });
  }, []);

  useEffect(() => {
    void mount();
    return () => {
      if (widgetIdRef.current && window.hcaptcha) {
        try {
          window.hcaptcha.remove(widgetIdRef.current);
        } catch {
          // O widget já pode ter sido removido com o nó; não há nada a recuperar.
        }
        widgetIdRef.current = null;
      }
    };
  }, [mount]);

  useEffect(() => {
    if (!resetSignal || !widgetIdRef.current || !window.hcaptcha) return;
    window.hcaptcha.reset(widgetIdRef.current);
    onTokenRef.current(null);
  }, [resetSignal]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} id={containerId} className="flex justify-center" />;
}
