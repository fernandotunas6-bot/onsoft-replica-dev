// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  GoogleIdentityButton,
  createGoogleIdentityNonce,
  isGoogleIdentityOriginAllowed,
} from "@/components/auth/GoogleIdentityButton";

const googleAuth = vi.hoisted(() => ({ signInWithIdToken: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: googleAuth } }));

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  delete (window as Window & { google?: unknown }).google;
});
afterAll(() => vi.unstubAllGlobals());

describe("login Google com identidade SIGA Plus", () => {
  it("usa apenas origens autorizadas, sem confiar em prefixos nem subdomínios inesperados", () => {
    const list = "https://portal-siga.com, https://ispab.portal-siga.com";
    expect(isGoogleIdentityOriginAllowed("https://portal-siga.com", list)).toBe(true);
    expect(isGoogleIdentityOriginAllowed("https://ispab.portal-siga.com", list)).toBe(true);
    expect(isGoogleIdentityOriginAllowed("https://outra.portal-siga.com", list)).toBe(false);
    expect(isGoogleIdentityOriginAllowed("https://portal-siga.com.evil.example", list)).toBe(false);
    expect(isGoogleIdentityOriginAllowed("http://portal-siga.com", "http://portal-siga.com")).toBe(
      false,
    );
    expect(isGoogleIdentityOriginAllowed("https://portal-siga.com", "")).toBe(false);
  });

  it("gera nonce aleatório e entrega ao Google somente o SHA-256", async () => {
    const first = await createGoogleIdentityNonce();
    const second = await createGoogleIdentityNonce();
    expect(first.raw).not.toBe(second.raw);
    expect(first.hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(first.raw).not.toBe(first.hashed);

    const actual = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(first.raw));
    const expected = Buffer.from(actual).toString("hex");
    expect(first.hashed).toBe(expected);
  });

  it("troca o fallback pelo botão oficial quando o client ID e a origem são válidos", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "public-client.apps.googleusercontent.com");
    vi.stubEnv("VITE_GOOGLE_ALLOWED_ORIGINS", window.location.origin);
    let receivedNonce: string | undefined;
    let onCredential: ((response: { credential?: string }) => void) | undefined;
    googleAuth.signInWithIdToken.mockResolvedValue({ error: null });
    const initialize = vi.fn(
      (options: { nonce: string; callback: (response: { credential?: string }) => void }) => {
        receivedNonce = options.nonce;
        onCredential = options.callback;
      },
    );
    const renderButton = vi.fn((element: HTMLElement) => {
      const button = document.createElement("button");
      button.textContent = "Botão Google oficial";
      element.appendChild(button);
    });
    Object.defineProperty(window, "google", {
      configurable: true,
      value: { accounts: { id: { initialize, renderButton } } },
    });

    render(
      <GoogleIdentityButton
        mode="signin"
        disabled={false}
        fallback={<button type="button">OAuth anterior</button>}
        onError={vi.fn()}
      />,
    );
    await screen.findByText("Botão Google oficial");
    expect(screen.queryByText("OAuth anterior")).toBeNull();
    expect(receivedNonce).toMatch(/^[a-f0-9]{64}$/);
    expect(renderButton).toHaveBeenCalledOnce();

    await act(async () => onCredential?.({ credential: "test-id-token" }));
    await waitFor(() => expect(googleAuth.signInWithIdToken).toHaveBeenCalledOnce());
    const request = googleAuth.signInWithIdToken.mock.calls[0]?.[0];
    expect(request).toMatchObject({ provider: "google", token: "test-id-token" });
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(request.nonce));
    expect(Buffer.from(digest).toString("hex")).toBe(receivedNonce);

    fireEvent.click(screen.getByRole("button", { name: /Problemas com o Google/i }));
    expect(screen.getByText("OAuth anterior")).toBeTruthy();
    onCredential?.({ credential: "ignored-after-switch" });
    expect(googleAuth.signInWithIdToken).toHaveBeenCalledOnce();
  });
  it("mantém o OAuth antigo quando o novo login está desactivado", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "public-client.apps.googleusercontent.com");
    vi.stubEnv("VITE_GOOGLE_ALLOWED_ORIGINS", window.location.origin);
    vi.stubEnv("VITE_GOOGLE_IDENTITY_ENABLED", "false");

    render(
      <GoogleIdentityButton
        mode="signin"
        disabled={false}
        fallback={<button type="button">OAuth anterior</button>}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText("OAuth anterior")).toBeTruthy();
    expect(screen.queryByTestId("google-identity-button")).toBeNull();
  });

});
