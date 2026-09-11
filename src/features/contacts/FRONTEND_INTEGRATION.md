# Frontend Integration Guide

Como integrar Contact Verification com componentes de UI do SIGA Plus.

## 1. Sincronizar Email Após Login

### Magic Link Flow
Quando o utilizador faz login via magic link, sincronizar a verificação de email:

```tsx
// src/routes/auth/magic-link-callback.tsx (ou similar)
import { useEffect } from "react";
import { useAuthStatus } from "@/integrations/supabase/use-auth-status";
import { syncMagicLinkVerificationFn } from "@/features/auth/magic-link-server";

export function MagicLinkCallback() {
  const { isLoggedIn, isLoading } = useAuthStatus();

  useEffect(() => {
    // Aguardar verificação de sessão
    if (!isLoading && isLoggedIn) {
      // Chamar servidor para marcar email como verificado
      syncMagicLinkVerificationFn().catch((err) => {
        console.error("Failed to sync verification:", err);
      });
    }
  }, [isLoggedIn, isLoading]);

  return <div>Redirecting...</div>;
}
```

### Password Reset Flow
Similar para reset de password:

```tsx
// src/routes/auth/password-reset-success.tsx
import { useEffect } from "react";
import { useAuthStatus } from "@/integrations/supabase/use-auth-status";
import { syncPasswordResetVerificationFn } from "@/features/auth/reset-password-server";

export function PasswordResetSuccess() {
  const { isLoggedIn, isLoading } = useAuthStatus();

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      syncPasswordResetVerificationFn().catch((err) => {
        console.error("Failed to sync verification:", err);
      });
    }
  }, [isLoggedIn, isLoading]);

  return <div>Password reset successfully!</div>;
}
```

## 2. Profile Card — Contact Verification Status

Mostrar status de verificação em "Minha Conta → Segurança":

```tsx
// src/routes/app/account/contact-verification.tsx
import { useQuery } from "@tanstack/react-query";
import { getContactVerificationProfileFn } from "@/features/contacts";

export function ContactVerificationStatus() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["contact-verification-profile"],
    queryFn: () => getContactVerificationProfileFn(),
  });

  if (isLoading) return <div>Loading...</div>;
  if (!profile) return <div>Error loading profile</div>;

  return (
    <div className="space-y-4">
      {/* Email */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">E-mail</h3>
            <p className="text-sm text-gray-600">{profile.emailAddress}</p>
          </div>
          <div>
            {profile.emailVerified ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800">
                <span className="inline-block w-2 h-2 bg-green-600 rounded-full mr-2"></span>
                Verificado
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-yellow-100 text-yellow-800">
                <span className="inline-block w-2 h-2 bg-yellow-600 rounded-full mr-2"></span>
                Pendente
              </span>
            )}
          </div>
        </div>
        {profile.emailVerifiedAt && (
          <p className="text-xs text-gray-500 mt-2">
            Verificado em {new Date(profile.emailVerifiedAt).toLocaleDateString("pt-PT")}
          </p>
        )}
      </div>

      {/* Telefone */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Telefone (SMS)</h3>
            <p className="text-sm text-gray-600">{profile.phoneNumber || "Não adicionado"}</p>
          </div>
          <div>
            {profile.phoneNumber ? (
              profile.phoneVerified ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800">
                  ✓ Verificado
                </span>
              ) : (
                <button className="text-blue-600 text-sm hover:underline">
                  Verificar
                </button>
              )
            ) : (
              <button className="text-blue-600 text-sm hover:underline">
                Adicionar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">WhatsApp</h3>
            <p className="text-sm text-gray-600">{profile.whatsappNumber || "Não adicionado"}</p>
          </div>
          <div>
            {profile.whatsappNumber ? (
              profile.whatsappVerified ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800">
                  ✓ Verificado
                </span>
              ) : (
                <button className="text-blue-600 text-sm hover:underline">
                  Verificar
                </button>
              )
            ) : (
              <button className="text-blue-600 text-sm hover:underline">
                Adicionar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

## 3. Communication Preferences Panel

Painel para escolher categorias e canais:

```tsx
// src/routes/app/account/communication-preferences.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { getCommunicationPreferencesFn, updateCommunicationPreferencesFn } from "@/features/contacts";

export function CommunicationPreferencesPanel() {
  const { data: prefs } = useQuery({
    queryKey: ["communication-preferences"],
    queryFn: () => getCommunicationPreferencesFn(),
  });

  const updateMutation = useMutation({
    mutationFn: updateCommunicationPreferencesFn,
  });

  const handleCategoryToggle = (category: string, value: boolean) => {
    updateMutation.mutate({ [category]: value });
  };

  if (!prefs) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-4">Preferências de Comunicação</h2>
        <p className="text-sm text-gray-600 mb-6">
          Escolha quais categorias de mensagens deseja receber.
        </p>
      </div>

      {/* Segurança (Obrigatória) */}
      <div className="border rounded-lg p-4 bg-red-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">🔒 Segurança</h3>
            <p className="text-xs text-gray-600 mt-1">
              Alertas de autenticação, mudanças de conta, tentativas suspeitas
            </p>
          </div>
          <div className="text-xs font-semibold text-red-700">OBRIGATÓRIO</div>
        </div>
        <input type="checkbox" checked disabled className="mt-3" />
      </div>

      {/* Académico */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">📚 Académico</h3>
            <p className="text-xs text-gray-600 mt-1">
              Notas, boletins, horários, eventos escolares
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.academicEnabled}
            onChange={(e) => handleCategoryToggle("academic", e.target.checked)}
          />
        </div>
      </div>

      {/* Financeiro */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">💳 Financeiro</h3>
            <p className="text-xs text-gray-600 mt-1">
              Pagamentos, recibos, faturas, avisos de vencimento
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.financialEnabled}
            onChange={(e) => handleCategoryToggle("financial", e.target.checked)}
          />
        </div>
      </div>

      {/* Presença */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">📍 Presença</h3>
            <p className="text-xs text-gray-600 mt-1">
              Faltas, justificações, avisos de comparência
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.attendanceEnabled}
            onChange={(e) => handleCategoryToggle("attendance", e.target.checked)}
          />
        </div>
      </div>

      {/* Marketing */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">📢 Marketing</h3>
            <p className="text-xs text-gray-600 mt-1">
              Newsletters, promoções, novidades da plataforma
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.marketingEnabled}
            onChange={(e) => handleCategoryToggle("marketing", e.target.checked)}
          />
        </div>
      </div>
    </div>
  );
}
```

## 4. OTP Verification Modal

Componente reutilizável para verificar contactos via OTP:

```tsx
// src/features/contacts/otp-verification-modal.tsx
import { useState } from "react";
import { requestOtpVerificationFn, verifyOtpCodeFn } from "@/features/otp/server";
import { ContactChannel } from "@/features/contacts";

interface OtpVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contactIdentifier: string; // Email ou telefone
  channel: ContactChannel;
  purpose: "email_change" | "phone_change" | "whatsapp_change";
}

export function OtpVerificationModal({
  isOpen,
  onClose,
  onSuccess,
  contactIdentifier,
  channel,
  purpose,
}: OtpVerificationModalProps) {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestCode = async () => {
    setIsLoading(true);
    try {
      const result = await requestOtpVerificationFn({
        targetIdentifier: contactIdentifier,
        purpose,
        preferredChannel: channel,
      });

      if (result.success) {
        setStep("verify");
        setError(null);
      } else {
        setError(result.message || "Erro ao enviar código");
      }
    } catch (err) {
      setError("Erro ao enviar código");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setIsLoading(true);
    try {
      const result = await verifyOtpCodeFn({
        targetIdentifier: contactIdentifier,
        purpose,
        code,
      });

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.message || "Código inválido");
      }
    } catch (err) {
      setError("Erro ao verificar código");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-8 max-w-sm">
        <h2 className="text-xl font-semibold mb-4">Verificar {channel}</h2>

        {step === "request" && (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Enviaremos um código de verificação para {contactIdentifier}
            </p>
            <button
              onClick={handleRequestCode}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? "Enviando..." : "Enviar Código"}
            </button>
          </>
        )}

        {step === "verify" && (
          <>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Código de Verificação
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 6))}
                placeholder="000000"
                className="w-full px-3 py-2 border rounded text-center text-xl tracking-widest"
              />
            </div>
            <button
              onClick={handleVerifyCode}
              disabled={isLoading || code.length !== 6}
              className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {isLoading ? "Verificando..." : "Verificar"}
            </button>
            <button
              onClick={() => setStep("request")}
              className="w-full mt-2 text-blue-600 py-2 text-sm hover:underline"
            >
              Reenviar Código
            </button>
          </>
        )}

        {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
```

## 5. Escolher Canal Preferido

Componente para o utilizador escolher o canal padrão:

```tsx
// src/routes/app/account/preferred-channel.tsx
import { useMutation } from "@tanstack/react-query";
import { setPreferredCommunicationChannelFn, type ContactChannel } from "@/features/contacts";

export function PreferredChannelSelector() {
  const mutation = useMutation({
    mutationFn: setPreferredCommunicationChannelFn,
  });

  const channels: Array<{ value: ContactChannel; label: string; icon: string }> = [
    { value: "email", label: "E-mail", icon: "📧" },
    { value: "sms", label: "SMS", icon: "💬" },
    { value: "whatsapp", label: "WhatsApp", icon: "💚" },
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Canal Preferido para Notificações</h3>
      {channels.map((ch) => (
        <label key={ch.value} className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="preferred-channel"
            value={ch.value}
            onChange={() => mutation.mutate({ channel: ch.value })}
            className="mr-3"
          />
          <span className="mr-2">{ch.icon}</span>
          <span>{ch.label}</span>
        </label>
      ))}
    </div>
  );
}
```

## 6. Testing

### Teste de Sincronização
```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { syncMagicLinkVerificationFn } from "@/features/auth/magic-link-server";

test("sincroniza verificação após magic link login", async () => {
  const { result } = renderHook(() => syncMagicLinkVerificationFn());
  
  await waitFor(() => {
    expect(result.current).toBeDefined();
  });
});
```

## Próximos Passos

- [ ] Criar componente de UI para adicionar telefone
- [ ] Criar componente de UI para adicionar WhatsApp
- [ ] Integrar OtpVerificationModal nos fluxos
- [ ] Testes e2e para verificação de contactos
- [ ] Dashboard de status de verificação

