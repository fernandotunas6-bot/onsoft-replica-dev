import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Google Identity Services (GIS) sends an ID token straight to Supabase Auth.
 * Unlike signInWithOAuth(), the Google account chooser belongs to the website,
 * not to <project-ref>.supabase.co. Supabase remains the session authority.
 *
 * This is opt-in: if no public Google Web Client ID is configured, the existing
 * OAuth redirect button remains available without any behaviour change.
 */
type CredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        nonce: string;
        use_fedcm_for_prompt: boolean;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: {
          type: "standard";
          theme: "outline";
          size: "large";
          text: "signin_with" | "continue_with";
          shape: "rectangular";
          logo_alignment: "left";
          width: number;
        },
      ) => void;
    };
  };
};

function googleIdentity(): GoogleIdentity | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { google?: GoogleIdentity }).google ?? null;
}

let googleScriptPromise: Promise<GoogleIdentity> | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  const ready = googleIdentity();
  if (ready) return Promise.resolve(ready);
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise<GoogleIdentity>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-siga-google-identity="true"]',
      );
      const script = existing ?? document.createElement("script");
      const onLoad = () => {
        const api = googleIdentity();
        if (api) resolve(api);
        else reject(new Error("Google Identity Services não ficou disponível."));
      };
      const onError = () =>
        reject(new Error("Não foi possível carregar o Google Identity Services."));
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!existing) {
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.dataset.sigaGoogleIdentity = "true";
        document.head.appendChild(script);
      }
    }).catch((error: unknown) => {
      googleScriptPromise = null;
      document.querySelector('script[data-siga-google-identity="true"]')?.remove();
      throw error;
    });
  }
  return googleScriptPromise;
}

/** GIS receives the SHA-256 nonce, Supabase receives the original nonce. */
export async function createGoogleIdentityNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(hashBuffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { raw, hashed };
}

/**
 * Google only accepts explicitly registered HTTPS origins (no wildcard
 * subdomains). An exact origin allowlist avoids breaking school/custom domains.
 */
export function isGoogleIdentityOriginAllowed(browserOrigin: string, originsCsv: string): boolean {
  return originsCsv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .some((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin === browserOrigin &&
          (url.protocol === "https:" || url.hostname === "localhost")
        );
      } catch {
        return false;
      }
    });
}

interface GoogleIdentityButtonProps {
  mode: "signin" | "signup";
  disabled: boolean;
  fallback: ReactNode;
  onError: (message: string) => void;
}

/** Do not use GIS for the Lovable MCP authorization redirect flow. */
export function GoogleIdentityButton({
  mode,
  disabled,
  fallback,
  onError,
}: GoogleIdentityButtonProps) {
  const [hydrated, setHydrated] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  // Emergency rollback: keep every previous Google OAuth flow available.
  const enabled = String(import.meta.env["VITE_GOOGLE_IDENTITY_ENABLED"] ?? "true") !== "false";
  const clientId = String(import.meta.env["VITE_GOOGLE_CLIENT_ID"] ?? "").trim();
  const allowedOrigins = String(
    import.meta.env["VITE_GOOGLE_ALLOWED_ORIGINS"] ??
      import.meta.env["VITE_APP_URL"] ??
      "https://portal-siga.com",
  );
  const isAllowed =
    enabled &&
    hydrated &&
    typeof window !== "undefined" &&
    Boolean(clientId) &&
    isGoogleIdentityOriginAllowed(window.location.origin, allowedOrigins) &&
    !window.location.pathname.startsWith("/.lovable/oauth/consent");
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Match the server-rendered fallback on the first browser render (SSR hydration).
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!isAllowed) return;
    let active = true;
    let authenticating = false;

    const setup = async () => {
      try {
        const [google, nonce] = await Promise.all([
          loadGoogleIdentity(),
          createGoogleIdentityNonce(),
        ]);
        if (!active || !container.current) return;

        google.accounts.id.initialize({
          client_id: clientId,
          nonce: nonce.hashed,
          use_fedcm_for_prompt: true,
          callback: ({ credential }) => {
            if (!active || disabledRef.current || authenticating) return;
            if (!credential) {
              onErrorRef.current("O Google não devolveu uma credencial válida.");
              return;
            }
            authenticating = true;
            void supabase.auth
              .signInWithIdToken({ provider: "google", token: credential, nonce: nonce.raw })
              .then(({ error }) => {
                if (active && error) {
                  onErrorRef.current("Não foi possível entrar com o Google. Tente novamente.");
                }
              })
              .catch(() => {
                if (active) onErrorRef.current("Não foi possível contactar a autenticação Google.");
              })
              .finally(() => {
                authenticating = false;
              });
          },
        });
        container.current.replaceChildren();
        google.accounts.id.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: mode === "signup" ? "continue_with" : "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: Math.max(200, Math.min(400, Math.floor(container.current.clientWidth || 360))),
        });
        if (active) setReady(true);
      } catch {
        if (active) setFailed(true);
      }
    };
    void setup();
    return () => {
      active = false;
    };
  }, [clientId, isAllowed, mode]);

  if (!isAllowed || failed || showFallback) return <>{fallback}</>;
  return (
    <div className={disabled ? "pointer-events-none opacity-50" : undefined} aria-busy={!ready}>
      <div
        ref={container}
        className={ready ? "mt-4 flex min-h-[44px] w-full items-center justify-center" : "hidden"}
        data-testid="google-identity-button"
      />
      {!ready ? fallback : null}
      {ready ? (
        <button
          type="button"
          className="mt-2 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:underline"
          onClick={() => setShowFallback(true)}
        >
          Problemas com o Google? Usar outro método
        </button>
      ) : null}
    </div>
  );
}
