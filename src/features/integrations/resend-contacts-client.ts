export interface ResendAudience {
  id: string;
  name: string;
  created_at: string;
}

export interface ResendContact {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  unsubscribed: boolean;
}

export interface CreateContactInput {
  audienceId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  unsubscribed?: boolean;
}

export class ResendContactsClient {
  private static getApiKey(): string {
    return (typeof process !== "undefined" && process.env?.RESEND_API_KEY?.trim()) || "";
  }

  /**
   * Lista todas as audiências (listas de contactos) da conta Resend.
   */
  public static async listAudiences(): Promise<ResendAudience[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch("https://api.resend.com/audiences", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Erro ao listar audiências no Resend: ${err}`);
    }

    const data = (await res.json()) as { data?: ResendAudience[] };
    return data.data || [];
  }

  /**
   * Cria uma audiência dedicada (ex: por escola ou categoria).
   */
  public static async createAudience(name: string): Promise<ResendAudience> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch("https://api.resend.com/audiences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Erro ao criar audiência no Resend: ${err}`);
    }

    return (await res.json()) as ResendAudience;
  }

  /**
   * Adiciona ou atualiza um contacto na audiência do Resend.
   */
  public static async createContact(input: CreateContactInput): Promise<ResendContact> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const cleanEmail = input.email.trim().toLowerCase();

    const res = await fetch(
      `https://api.resend.com/audiences/${encodeURIComponent(input.audienceId)}/contacts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
          first_name: input.firstName?.trim() || undefined,
          last_name: input.lastName?.trim() || undefined,
          unsubscribed: input.unsubscribed ?? false,
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Erro ao criar contacto no Resend: ${err}`);
    }

    return (await res.json()) as ResendContact;
  }

  /**
   * Lista contactos pertencentes a uma audiência.
   */
  public static async listContacts(audienceId: string): Promise<ResendContact[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch(
      `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Erro ao listar contactos no Resend: ${err}`);
    }

    const data = (await res.json()) as { data?: ResendContact[] };
    return data.data || [];
  }

  /**
   * Remove um contacto de uma audiência.
   */
  public static async deleteContact(audienceId: string, contactId: string): Promise<boolean> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch(
      `https://api.resend.com/audiences/${encodeURIComponent(audienceId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    return res.ok;
  }
}
