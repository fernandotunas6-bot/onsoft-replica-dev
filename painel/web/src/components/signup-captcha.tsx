import { useEffect, useRef } from "react";

/**
 * hCaptcha no último passo do registo de escola.
 *
 * Só aparece com `VITE_HCAPTCHA_SITE_KEY` no build. O SIGA verifica o sinal quando
 * tem `HCAPTCHA_SECRET_KEY`; os dois configuram-se juntos (mesmo par da conta). O
 * sinal é de uso único: depois de cada tentativa, `resetSignal` pede um novo.
 */
export const SIGNUP_CAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

type HCaptchaApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

let scriptPromise: Promise<void> | null = null;

function loadHCaptcha(): Promise<void> {
  const w = window as unknown as { hcaptcha?: HCaptchaApi } & Record<string, unknown>;
  if (w.hcaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.hcaptcha.com/1/api.js?render=explicit&onload=__webHcaptchaReady";
    script.async = true;
    script.defer = true;
    w["__webHcaptchaReady"] = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Não foi possível carregar o hCaptcha."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function SignupCaptcha({
  onToken,
  resetSignal,
}: {
  onToken: (token: string | null) => void;
  resetSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SIGNUP_CAPTCHA_SITE_KEY) return;
    let cancelled = false;
    void loadHCaptcha()
      .then(() => {
        const api = (window as unknown as { hcaptcha?: HCaptchaApi }).hcaptcha;
        if (cancelled || !api || !containerRef.current || widgetIdRef.current) return;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: SIGNUP_CAPTCHA_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      const api = (window as unknown as { hcaptcha?: HCaptchaApi }).hcaptcha;
      if (widgetIdRef.current && api) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // O widget já saiu com o nó.
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const api = (window as unknown as { hcaptcha?: HCaptchaApi }).hcaptcha;
    if (!resetSignal || !widgetIdRef.current || !api) return;
    api.reset(widgetIdRef.current);
    onTokenRef.current(null);
  }, [resetSignal]);

  if (!SIGNUP_CAPTCHA_SITE_KEY) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
