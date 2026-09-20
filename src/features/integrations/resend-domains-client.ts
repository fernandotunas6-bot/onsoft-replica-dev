export interface ResendDnsRecord {
  record: "SPF" | "DKIM";
  name: string;
  type: string;
  ttl: string;
  status: "not_started" | "pending" | "verified" | "failed";
  value: string;
  priority?: number;
}

export interface ResendDomainItem {
  id: string;
  name: string;
  status: "not_started" | "pending" | "verified" | "failed";
  created_at: string;
  region: string;
  records?: ResendDnsRecord[];
}

export class ResendDomainsClient {
  private static getApiKey(): string {
    return (typeof process !== "undefined" && process.env?.RESEND_API_KEY?.trim()) || "";
  }

  /**
   * Lista todos os domínios configurados na conta Resend.
   */
  public static async listDomains(): Promise<ResendDomainItem[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Erro ao listar domínios no Resend (HTTP ${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { data?: ResendDomainItem[] };
    return data.data || [];
  }

  /**
   * Obtém detalhes e registos DNS (DKIM, SPF) de um domínio específico.
   */
  public static async getDomain(domainId: string): Promise<ResendDomainItem> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch(`https://api.resend.com/domains/${encodeURIComponent(domainId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Erro ao obter domínio no Resend: ${errorText}`);
    }

    return (await res.json()) as ResendDomainItem;
  }

  /**
   * Regista um novo domínio institucional no Resend.
   */
  public static async createDomain(name: string): Promise<ResendDomainItem> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const cleanName = name.trim().toLowerCase();

    const res = await fetch("https://api.resend.com/domains", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: cleanName }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Erro ao criar domínio no Resend: ${errorText}`);
    }

    return (await res.json()) as ResendDomainItem;
  }

  /**
   * Força verificação dos registos DNS no Resend.
   */
  public static async verifyDomain(domainId: string): Promise<{ success: boolean }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("RESEND_API_KEY não configurada no servidor.");

    const res = await fetch(
      `https://api.resend.com/domains/${encodeURIComponent(domainId)}/verify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    return { success: res.ok };
  }
}
