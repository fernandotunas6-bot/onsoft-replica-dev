import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getContactVerificationProfileFn,
  getCommunicationPreferencesFn,
  updateCommunicationPreferencesFn,
} from "@/features/contacts";
import type { ContactVerificationProfile, CommunicationPreferences } from "@/features/contacts";

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
  const [expandedSection, setExpandedSection] = useState<"verification" | "preferences" | null>(null);

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
    mutationFn: updateCommunicationPreferencesFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communication-preferences"] });
    },
  });

  if (profileLoading || preferencesLoading) {
    return (
      <div className="space-y-4">
        <div className="h-20 bg-gray-200 rounded animate-pulse" />
        <div className="h-20 bg-gray-200 rounded animate-pulse" />
      </div>
    );
  }

  if (profileError || preferencesError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 text-sm">Erro ao carregar dados de verificação</p>
      </div>
    );
  }

  if (!profile || !preferences) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Secção 1: Verificação de Contactos */}
      <div className="border rounded-lg">
        <button
          onClick={() =>
            setExpandedSection(expandedSection === "verification" ? null : "verification")
          }
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
        >
          <h3 className="font-semibold text-lg">🔐 Verificação de Contactos</h3>
          <span className="text-gray-500">{expandedSection === "verification" ? "−" : "+"}</span>
        </button>

        {expandedSection === "verification" && (
          <div className="border-t px-4 py-4 space-y-4 bg-gray-50">
            {/* Email */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">📧 E-mail</p>
                <p className="text-xs text-gray-600">{profile.emailAddress}</p>
              </div>
              <div className="text-right">
                {profile.emailVerified ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                    ✓ Verificado
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
                    ⏳ Pendente
                  </span>
                )}
              </div>
            </div>

            {/* Telefone (SMS) */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                <p className="font-medium text-sm">📱 Telefone (SMS)</p>
                <p className="text-xs text-gray-600">{profile.phoneNumber || "Não adicionado"}</p>
              </div>
              <div className="text-right">
                {profile.phoneNumber ? (
                  profile.phoneVerified ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                      ✓ Verificado
                    </span>
                  ) : (
                    <button className="text-blue-600 text-xs hover:underline font-medium">
                      Verificar
                    </button>
                  )
                ) : (
                  <button className="text-blue-600 text-xs hover:underline font-medium">
                    Adicionar
                  </button>
                )}
              </div>
            </div>

            {/* WhatsApp */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                <p className="font-medium text-sm">💚 WhatsApp</p>
                <p className="text-xs text-gray-600">{profile.whatsappNumber || "Não adicionado"}</p>
              </div>
              <div className="text-right">
                {profile.whatsappNumber ? (
                  profile.whatsappVerified ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                      ✓ Verificado
                    </span>
                  ) : (
                    <button className="text-blue-600 text-xs hover:underline font-medium">
                      Verificar
                    </button>
                  )
                ) : (
                  <button className="text-blue-600 text-xs hover:underline font-medium">
                    Adicionar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Secção 2: Preferências de Comunicação */}
      <div className="border rounded-lg">
        <button
          onClick={() =>
            setExpandedSection(expandedSection === "preferences" ? null : "preferences")
          }
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
        >
          <h3 className="font-semibold text-lg">📬 Preferências de Comunicação</h3>
          <span className="text-gray-500">{expandedSection === "preferences" ? "−" : "+"}</span>
        </button>

        {expandedSection === "preferences" && (
          <div className="border-t px-4 py-4 space-y-3 bg-gray-50">
            {/* Segurança (Obrigatória) */}
            <div className="flex items-center justify-between p-3 border border-red-200 rounded bg-red-50">
              <div>
                <p className="font-medium text-sm">🔒 Segurança</p>
                <p className="text-xs text-gray-600">Alertas de autenticação, mudanças de conta</p>
              </div>
              <div className="text-xs font-bold text-red-700">OBRIGATÓRIO</div>
            </div>

            {/* Académico */}
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium text-sm">📚 Académico</p>
                <p className="text-xs text-gray-600">Notas, boletins, horários</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.academicEnabled}
                onChange={(e) =>
                  updatePrefsMutation.mutate({ academic: e.target.checked })
                }
                disabled={updatePrefsMutation.isPending}
                className="cursor-pointer"
              />
            </div>

            {/* Financeiro */}
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium text-sm">💳 Financeiro</p>
                <p className="text-xs text-gray-600">Pagamentos, recibos, faturas</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.financialEnabled}
                onChange={(e) =>
                  updatePrefsMutation.mutate({ financial: e.target.checked })
                }
                disabled={updatePrefsMutation.isPending}
                className="cursor-pointer"
              />
            </div>

            {/* Presença */}
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium text-sm">📍 Presença</p>
                <p className="text-xs text-gray-600">Faltas, justificações, avisos</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.attendanceEnabled}
                onChange={(e) =>
                  updatePrefsMutation.mutate({ attendance: e.target.checked })
                }
                disabled={updatePrefsMutation.isPending}
                className="cursor-pointer"
              />
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium text-sm">📢 Marketing</p>
                <p className="text-xs text-gray-600">Newsletters, promoções, novidades</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.marketingEnabled}
                onChange={(e) =>
                  updatePrefsMutation.mutate({ marketing: e.target.checked })
                }
                disabled={updatePrefsMutation.isPending}
                className="cursor-pointer"
              />
            </div>

            {updatePrefsMutation.isPending && (
              <p className="text-xs text-gray-500 text-center pt-2">Atualizando...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
