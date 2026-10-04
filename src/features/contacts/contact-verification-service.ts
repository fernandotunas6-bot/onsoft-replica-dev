import type { Json, TablesUpdate } from "@/integrations/supabase/types";
import { Database } from "@/integrations/supabase/types";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";

export type ContactChannel = "email" | "sms" | "whatsapp";

interface ContactVerificationProfileRow {
  id: string;
  user_id: string;
  school_id: string | null;
  email_address: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  whatsapp_number: string | null;
  whatsapp_verified: boolean;
  whatsapp_verified_at: string | null;
  preferred_communication_channel: string;
  preferred_language: string;
  last_email_sent_at: string | null;
  last_sms_sent_at: string | null;
  last_whatsapp_sent_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

interface UserCommunicationPreferencesRow {
  id: string;
  user_id: string;
  school_id: string | null;
  security_enabled: boolean;
  academic_enabled: boolean;
  financial_enabled: boolean;
  attendance_enabled: boolean;
  calendar_enabled: boolean;
  announcements_enabled: boolean;
  events_enabled: boolean;
  documents_enabled: boolean;
  marketing_enabled: boolean;
  channel_preferences: Json;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface ContactVerificationProfile {
  id: string;
  userId: string;
  schoolId: string | null;

  emailAddress: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;

  phoneNumber: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;

  whatsappNumber: string | null;
  whatsappVerified: boolean;
  whatsappVerifiedAt: string | null;

  preferredCommunicationChannel: ContactChannel;
  preferredLanguage: string;

  lastEmailSentAt: string | null;
  lastSmsSentAt: string | null;
  lastWhatsappSentAt: string | null;

  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CommunicationPreferences {
  id: string;
  userId: string;
  schoolId: string | null;

  securityEnabled: boolean;
  academicEnabled: boolean;
  financialEnabled: boolean;
  attendanceEnabled: boolean;
  calendarEnabled: boolean;
  announcementsEnabled: boolean;
  eventsEnabled: boolean;
  documentsEnabled: boolean;
  marketingEnabled: boolean;

  channelPreferences: Record<string, ContactChannel[]>;

  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * ContactVerificationService — Gerencia perfis de verificação de contacto
 * multi-canal (email, SMS, WhatsApp) para cada utilizador.
 *
 * Responsável por:
 * - Criar/atualizar perfis de verificação
 * - Marcar canais como verificados
 * - Gerir preferências de comunicação
 * - Resolver qual canal usar para um utilizador
 */
export class ContactVerificationService {
  /**
   * Obtém ou cria um perfil de verificação de contacto para um utilizador.
   */
  public static async getOrCreateProfile(
    userId: string,
    schoolId?: string | null,
  ): Promise<ContactVerificationProfile> {
    const db = await loadSgaAdminClient();

    const { data: profile, error } = await db
      .from("contact_verification_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (profile) {
      return this.mapRowToProfile(profile);
    }

    // Criar novo perfil
    const { data: newProfile, error: createError } = await db
      .from("contact_verification_profiles")
      .insert({
        user_id: userId,
        school_id: schoolId ?? null,
      })
      .select("*")
      .single();

    if (createError || !newProfile) {
      throw new Error(`Falha ao criar perfil: ${createError?.message}`);
    }

    return this.mapRowToProfile(newProfile);
  }

  /**
   * As oito operações abaixo eram oito cópias do mesmo bloco de catorze linhas: pedir o
   * cliente, `update(…)` com `.eq("user_id", …)`, e traduzir o erro. A forma repetida
   * escondia duas coisas — que os três canais são o mesmo caso parametrizado, e que o
   * `updated_at` que cada uma enviava deixou de ter efeito.
   */
  private static readonly COLUNAS_POR_CANAL: Record<
    ContactChannel,
    { contacto: string; verificado: string; verificadoEm: string; ultimoEnvio: string }
  > = {
    email: {
      contacto: "email_address",
      verificado: "email_verified",
      verificadoEm: "email_verified_at",
      ultimoEnvio: "last_email_sent_at",
    },
    sms: {
      contacto: "phone_number",
      verificado: "phone_verified",
      verificadoEm: "phone_verified_at",
      ultimoEnvio: "last_sms_sent_at",
    },
    whatsapp: {
      contacto: "whatsapp_number",
      verificado: "whatsapp_verified",
      verificadoEm: "whatsapp_verified_at",
      ultimoEnvio: "last_whatsapp_sent_at",
    },
  };

  /**
   * Aplica um patch ao perfil do utilizador.
   *
   * Não envia `updated_at`: o trigger `siga_touch_updated_at_and_version` da tabela
   * escreve-o (e incrementa `version`) em cada UPDATE, pelo que o valor que o cliente
   * mandasse era substituído antes de chegar ao disco. Mandá-lo dava a impressão de que
   * era o serviço a controlar o carimbo, que não é.
   */
  private static async patchProfile(
    userId: string,
    patch: TablesUpdate<"contact_verification_profiles">,
    falha: string,
  ): Promise<void> {
    const db = await loadSgaAdminClient();

    const { error } = await db
      .from("contact_verification_profiles")
      .update(patch)
      .eq("user_id", userId);

    if (error) {
      throw new Error(`${falha}: ${error.message}`);
    }
  }

  /** Grava o contacto de um canal e volta a pô-lo por verificar. */
  private static async setContacto(
    userId: string,
    canal: ContactChannel,
    valor: string,
    falha: string,
  ): Promise<void> {
    const colunas = this.COLUNAS_POR_CANAL[canal];
    await this.patchProfile(
      userId,
      {
        [colunas.contacto]: valor,
        [colunas.verificado]: false,
        [colunas.verificadoEm]: null,
      },
      falha,
    );
  }

  /** Marca o canal como verificado, com o momento em que o foi. */
  private static async marcarVerificado(
    userId: string,
    canal: ContactChannel,
    falha: string,
  ): Promise<void> {
    const colunas = this.COLUNAS_POR_CANAL[canal];
    await this.patchProfile(
      userId,
      {
        [colunas.verificado]: true,
        [colunas.verificadoEm]: new Date().toISOString(),
      },
      falha,
    );
  }

  /**
   * Atualiza o endereço de email e marca como não verificado.
   */
  public static async updateEmailAddress(userId: string, newEmail: string): Promise<void> {
    await this.setContacto(
      userId,
      "email",
      newEmail.toLowerCase().trim(),
      "Falha ao atualizar email",
    );
  }

  /**
   * Marca o email como verificado.
   */
  public static async markEmailAsVerified(userId: string): Promise<void> {
    // Só o e-mail que o Auth confirmou (magic link ou reposição de senha) conta
    // como verificado, e é esse endereço que fica no perfil. Um login por senha
    // sem e-mail confirmado não marca nada.
    const db = await loadSgaAdminClient();
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error) throw new Error(`Falha ao confirmar o email: ${error.message}`);
    const email = data.user?.email?.toLowerCase().trim();
    if (!email || !data.user?.email_confirmed_at) {
      throw new Error("O email desta conta ainda não foi confirmado.");
    }
    await this.patchProfile(
      userId,
      {
        email_address: email,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      },
      "Falha ao marcar email como verificado",
    );
  }

  /**
   * Atualiza o número de telefone e marca como não verificado.
   */
  public static async updatePhoneNumber(userId: string, phoneNumber: string): Promise<void> {
    await this.setContacto(userId, "sms", phoneNumber, "Falha ao atualizar telefone");
  }

  /**
   * Marca o telefone como verificado.
   */
  public static async markPhoneAsVerified(userId: string): Promise<void> {
    await this.marcarVerificado(userId, "sms", "Falha ao marcar telefone como verificado");
  }

  /**
   * Atualiza o número do WhatsApp e marca como não verificado.
   */
  public static async updateWhatsappNumber(userId: string, whatsappNumber: string): Promise<void> {
    await this.setContacto(userId, "whatsapp", whatsappNumber, "Falha ao atualizar WhatsApp");
  }

  /**
   * Marca o WhatsApp como verificado.
   */
  public static async markWhatsappAsVerified(userId: string): Promise<void> {
    await this.marcarVerificado(userId, "whatsapp", "Falha ao marcar WhatsApp como verificado");
  }

  /**
   * Atualiza o canal de comunicação preferido.
   */
  public static async setPreferredChannel(userId: string, channel: ContactChannel): Promise<void> {
    await this.patchProfile(
      userId,
      { preferred_communication_channel: channel },
      "Falha ao atualizar canal preferido",
    );
  }

  /**
   * Registra o horário do último envio para um canal específico.
   *
   * Best-effort: um carimbo de auditoria perdido não deve fazer falhar o envio que o
   * originou, por isso regista o erro e não o lança.
   */
  public static async recordLastMessageSent(
    userId: string,
    channel: ContactChannel,
  ): Promise<void> {
    try {
      await this.patchProfile(
        userId,
        { [this.COLUNAS_POR_CANAL[channel].ultimoEnvio]: new Date().toISOString() },
        "Falha ao registar envio",
      );
    } catch (erro) {
      console.error(erro instanceof Error ? erro.message : String(erro));
    }
  }

  /**
   * Obtém as preferências de comunicação do utilizador (ou cria padrão).
   */
  public static async getOrCreateCommunicationPreferences(
    userId: string,
    schoolId?: string | null,
  ): Promise<CommunicationPreferences> {
    const db = await loadSgaAdminClient();

    const { data: prefs, error } = await db
      .from("user_communication_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (prefs) {
      return this.mapRowToPreferences(prefs);
    }

    // Criar preferências padrão
    const { data: newPrefs, error: createError } = await db
      .from("user_communication_preferences")
      .insert({
        user_id: userId,
        school_id: schoolId ?? null,
      })
      .select("*")
      .single();

    if (createError || !newPrefs) {
      throw new Error(`Falha ao criar preferências: ${createError?.message}`);
    }

    return this.mapRowToPreferences(newPrefs);
  }

  /**
   * Atualiza categorias de comunicação habilitadas/desabilitadas.
   * NOTA: Segurança é sempre obrigatória e não pode ser desabilitada.
   */
  public static async updateCommunicationCategories(
    userId: string,
    categories: Partial<
      Record<
        | "academic"
        | "financial"
        | "attendance"
        | "calendar"
        | "announcements"
        | "events"
        | "documents"
        | "marketing",
        boolean
      >
    >,
  ): Promise<void> {
    const db = await loadSgaAdminClient();

    const updates: Record<string, boolean> = {};

    if (typeof categories.academic === "boolean") updates.academic_enabled = categories.academic;
    if (typeof categories.financial === "boolean") updates.financial_enabled = categories.financial;
    if (typeof categories.attendance === "boolean")
      updates.attendance_enabled = categories.attendance;
    if (typeof categories.calendar === "boolean") updates.calendar_enabled = categories.calendar;
    if (typeof categories.announcements === "boolean")
      updates.announcements_enabled = categories.announcements;
    if (typeof categories.events === "boolean") updates.events_enabled = categories.events;
    if (typeof categories.documents === "boolean") updates.documents_enabled = categories.documents;
    if (typeof categories.marketing === "boolean") updates.marketing_enabled = categories.marketing;

    const { error } = await db
      .from("user_communication_preferences")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      throw new Error(`Falha ao atualizar preferências: ${error.message}`);
    }
  }

  /**
   * Resolve qual canal usar para um utilizador baseado em:
   * 1. Canais verificados
   * 2. Canal preferido
   * 3. Fallback configurado
   */
  public static resolveChannel(
    profile: ContactVerificationProfile,
    preferredChannels?: ContactChannel[],
  ): ContactChannel | null {
    const availableChannels: ContactChannel[] = [];

    if (profile.emailVerified && profile.emailAddress) {
      availableChannels.push("email");
    }
    if (profile.phoneVerified && profile.phoneNumber) {
      availableChannels.push("sms");
    }
    if (profile.whatsappVerified && profile.whatsappNumber) {
      availableChannels.push("whatsapp");
    }

    if (availableChannels.length === 0) {
      return null;
    }

    // Se há canais preferidos, tentar usar esses primeiro
    if (preferredChannels && preferredChannels.length > 0) {
      for (const pref of preferredChannels) {
        if (availableChannels.includes(pref)) {
          return pref;
        }
      }
    }

    // Fallback ao canal preferido do utilizador
    if (availableChannels.includes(profile.preferredCommunicationChannel)) {
      return profile.preferredCommunicationChannel;
    }

    // Fallback final: primeira opção disponível
    return availableChannels[0] ?? null;
  }

  private static mapRowToProfile(row: ContactVerificationProfileRow): ContactVerificationProfile {
    return {
      id: row.id,
      userId: row.user_id,
      schoolId: row.school_id,

      emailAddress: row.email_address,
      emailVerified: row.email_verified,
      emailVerifiedAt: row.email_verified_at,

      phoneNumber: row.phone_number,
      phoneVerified: row.phone_verified,
      phoneVerifiedAt: row.phone_verified_at,

      whatsappNumber: row.whatsapp_number,
      whatsappVerified: row.whatsapp_verified,
      whatsappVerifiedAt: row.whatsapp_verified_at,

      preferredCommunicationChannel: row.preferred_communication_channel as ContactChannel,
      preferredLanguage: row.preferred_language,

      lastEmailSentAt: row.last_email_sent_at,
      lastSmsSentAt: row.last_sms_sent_at,
      lastWhatsappSentAt: row.last_whatsapp_sent_at,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  private static mapRowToPreferences(
    row: UserCommunicationPreferencesRow,
  ): CommunicationPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      schoolId: row.school_id,

      securityEnabled: row.security_enabled,
      academicEnabled: row.academic_enabled,
      financialEnabled: row.financial_enabled,
      attendanceEnabled: row.attendance_enabled,
      calendarEnabled: row.calendar_enabled,
      announcementsEnabled: row.announcements_enabled,
      eventsEnabled: row.events_enabled,
      documentsEnabled: row.documents_enabled,
      marketingEnabled: row.marketing_enabled,

      channelPreferences: row.channel_preferences as Record<string, ContactChannel[]>,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }
}
