import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getContactVerificationProfileFn,
  getCommunicationPreferencesFn,
  updateCommunicationPreferencesFn,
} from "@/features/contacts";
import type {
  ContactVerificationProfile,
  CommunicationPreferences,
  UpdateCommunicationPreferencesInput,
} from "@/features/contacts";
import { PhoneChangeModal } from "./PhoneChangeModal";

/**
 * VerificationStatus — Componente para gerenciar verificação de contactos
 * e preferências de comunicação.
 *
 * Uso:
 * import { VerificationStatus } from "@/components/account/VerificationStatus";
 * <VerificationStatus />
 */
export function VerificationStatus() {
  const queryClient = useQueryClient();
  const [expandedSection, setExpandedSection] = useState<"verification" | "preferences" | null>(
    null,
  );
  const [phoneChangeModalOpen, setPhoneChangeModalOpen] = useState(false);

  // 1. Obter perfil de verificação
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useQuery<ContactVerificationProfile>({
    queryKey: ["contact-verification-profile"],
    queryFn: () => getContactVerificationProfileFn(),
  });

  // 2. Obter preferências de comunicação
  const {
    data: preferences,
    isLoading: preferencesLoading,
    error: preferencesError,
  } = useQuery<CommunicationPreferences>({
    queryKey: ["communication-preferences"],
    queryFn: () => getCommunicationPreferencesFn(),
  });

  // 3. Mutation para atualizar preferências
  const updatePrefsMutation = useMutation({
    mutationFn: (data: UpdateCommunicationPreferencesInput) =>
      updateCommunicationPreferencesFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication-preferences"] });
    },
  });

  if (profileLoading || preferencesLoading) {
    return (
      <div className="space-y-4">
        <div className="h-20 bg-muted rounded-xl animate-pulse" />
        <div className="h-20 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (profileError || preferencesError) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
        <p className="text-destructive text-sm">Erro ao carregar dados de verificação</p>
      </div>
    );
  }

  if (!profile || !preferences) {
    return null;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Secção 1: Verificação de Contactos */}
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() =>
              setExpandedSection(expandedSection === "verification" ? null : "verification")
            }
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
          >
            <h3 className="font-semibold text-lg">🔐 Verificação de Contactos</h3>
            <span className="text-muted-foreground">
              {expandedSection === "verification" ? "−" : "+"}
            </span>
          </button>

          {expandedSection === "verification" && (
            <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/20">
              {/* Email */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">📧 E-mail</p>
                  <p className="text-xs text-muted-foreground">{profile.emailAddress}</p>
                </div>
                <div className="text-right">
                  {profile.emailVerified ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-success/15 text-success text-xs font-medium">
                      ✓ Verificado
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-warning/15 text-warning text-xs font-medium">
                      ⏳ Pendente
                    </span>
                  )}
                </div>
              </div>

              {/* Telefone (SMS) */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <div>
                  <p className="font-medium text-sm">📱 Telefone (SMS)</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.phoneNumber || "Não adicionado"}
                  </p>
                </div>
                <div className="text-right">
                  {profile.phoneNumber ? (
                    profile.phoneVerified ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-success/15 text-success text-xs font-medium">
                        ✓ Verificado
                      </span>
                    ) : (
                      <button
                        className="text-primary text-xs hover:underline font-medium"
                        onClick={() => setPhoneChangeModalOpen(true)}
                      >
                        Verificar
                      </button>
                    )
                  ) : (
                    <button
                      className="text-primary text-xs hover:underline font-medium"
                      onClick={() => setPhoneChangeModalOpen(true)}
                    >
                      Adicionar
                    </button>
                  )}
                </div>
              </div>

              {/* WhatsApp */}
              <div className="flex items-center justify-between pt-3 border-t border-border/50">
                <div>
                  <p className="font-medium text-sm">💚 WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.whatsappNumber || "Não adicionado"}
                  </p>
                </div>
                <div className="text-right">
                  {profile.whatsappNumber ? (
                    profile.whatsappVerified ? (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-success/15 text-success text-xs font-medium">
                        ✓ Verificado
                      </span>
                    ) : (
                      <button className="text-primary text-xs hover:underline font-medium">
                        Verificar
                      </button>
                    )
                  ) : (
                    <button className="text-primary text-xs hover:underline font-medium">
                      Adicionar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Secção 2: Preferências de Comunicação */}
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() =>
              setExpandedSection(expandedSection === "preferences" ? null : "preferences")
            }
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
          >
            <h3 className="font-semibold text-lg">📬 Preferências de Comunicação</h3>
            <span className="text-muted-foreground">
              {expandedSection === "preferences" ? "−" : "+"}
            </span>
          </button>

          {expandedSection === "preferences" && (
            <div className="border-t border-border px-4 py-4 space-y-3 bg-muted/20">
              {/* Segurança (Obrigatória) */}
              <div className="flex items-center justify-between p-3 border border-destructive/20 rounded-xl bg-destructive/10">
                <div>
                  <p className="font-medium text-sm">🔒 Segurança</p>
                  <p className="text-xs text-muted-foreground">
                    Alertas de autenticação, mudanças de conta
                  </p>
                </div>
                <div className="text-xs font-bold text-destructive">OBRIGATÓRIO</div>
              </div>

              {/* Académico */}
              <div className="flex items-center justify-between p-3">
                <div>
                  <label htmlFor="pref-academic" className="font-medium text-sm cursor-pointer">
                    📚 Académico
                  </label>
                  <p className="text-xs text-muted-foreground">Notas, boletins, horários</p>
                </div>
                <input
                  id="pref-academic"
                  aria-label="Notificações académicas"
                  type="checkbox"
                  checked={preferences.academicEnabled}
                  onChange={(e) => updatePrefsMutation.mutate({ academic: e.target.checked })}
                  disabled={updatePrefsMutation.isPending}
                  className="cursor-pointer"
                />
              </div>

              {/* Financeiro */}
              <div className="flex items-center justify-between p-3">
                <div>
                  <label htmlFor="pref-financial" className="font-medium text-sm cursor-pointer">
                    💳 Financeiro
                  </label>
                  <p className="text-xs text-muted-foreground">Pagamentos, recibos, faturas</p>
                </div>
                <input
                  id="pref-financial"
                  aria-label="Notificações financeiras"
                  type="checkbox"
                  checked={preferences.financialEnabled}
                  onChange={(e) => updatePrefsMutation.mutate({ financial: e.target.checked })}
                  disabled={updatePrefsMutation.isPending}
                  className="cursor-pointer"
                />
              </div>

              {/* Presença */}
              <div className="flex items-center justify-between p-3">
                <div>
                  <label htmlFor="pref-attendance" className="font-medium text-sm cursor-pointer">
                    📍 Presença
                  </label>
                  <p className="text-xs text-muted-foreground">Faltas, justificações, avisos</p>
                </div>
                <input
                  id="pref-attendance"
                  aria-label="Notificações de presença"
                  type="checkbox"
                  checked={preferences.attendanceEnabled}
                  onChange={(e) => updatePrefsMutation.mutate({ attendance: e.target.checked })}
                  disabled={updatePrefsMutation.isPending}
                  className="cursor-pointer"
                />
              </div>

              {/* Marketing */}
              <div className="flex items-center justify-between p-3">
                <div>
                  <label htmlFor="pref-marketing" className="font-medium text-sm cursor-pointer">
                    📢 Marketing
                  </label>
                  <p className="text-xs text-muted-foreground">Newsletters, promoções, novidades</p>
                </div>
                <input
                  id="pref-marketing"
                  aria-label="Notificações de marketing"
                  type="checkbox"
                  checked={preferences.marketingEnabled}
                  onChange={(e) => updatePrefsMutation.mutate({ marketing: e.target.checked })}
                  disabled={updatePrefsMutation.isPending}
                  className="cursor-pointer"
                />
              </div>

              {updatePrefsMutation.isPending && (
                <p className="text-xs text-muted-foreground text-center pt-2">Atualizando...</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal para mudança de telefone */}
      <PhoneChangeModal
        open={phoneChangeModalOpen}
        onOpenChange={setPhoneChangeModalOpen}
        currentPhone={profile?.phoneNumber}
      />
    </>
  );
}
