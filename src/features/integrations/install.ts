import {
  academicIntegrationCatalog,
  isCatalogIntegrationId,
  type CatalogIntegrationId,
} from "./catalog";

export type SigaHostModule =
  | "pedagogica"
  | "financeiro"
  | "faturas"
  | "calendario"
  | "comunicacoes"
  | "alunos"
  | "documentos"
  | "arquivos"
  | "pessoas";

export type IntegrationCapability = {
  id: string;
  label: string;
  description: string;
  module: SigaHostModule;
  moduleLabel: string;
};

export type IntegrationInstallPackage = {
  provider: CatalogIntegrationId;
  installUrl: string;
  docsUrl: string;
  summary: string;
  capabilities: IntegrationCapability[];
};

const moduleLabel: Record<SigaHostModule, string> = {
  pedagogica: "Pedagógica",
  financeiro: "Tesouraria",
  faturas: "Faturas",
  calendario: "Calendário",
  comunicacoes: "Comunicações",
  alunos: "Alunos",
  documentos: "Documentos",
  arquivos: "Arquivos",
  pessoas: "Pessoas & Docentes",
};

function cap(
  id: string,
  label: string,
  description: string,
  module: SigaHostModule,
): IntegrationCapability {
  return { id, label, description, module, moduleLabel: moduleLabel[module] };
}

export const integrationInstallPackages: Record<CatalogIntegrationId, IntegrationInstallPackage> = {
  multicaixa_express: {
    provider: "multicaixa_express",
    installUrl: "https://www.emis.co.ao/",
    docsUrl: "https://www.emis.co.ao/",
    summary: "Instala referências EMIS e confirmação de pagamentos na tesouraria e nas faturas.",
    capabilities: [
      cap(
        "multicaixa.references",
        "Referências Multicaixa",
        "Gerar e copiar referências de pagamento nas faturas e planos.",
        "financeiro",
      ),
      cap(
        "multicaixa.confirm",
        "Confirmar recebimentos",
        "Marcar confirmações EMIS no módulo de faturas.",
        "faturas",
      ),
    ],
  },
  unitel_money: {
    provider: "unitel_money",
    installUrl: "https://www.unitel.ao/",
    docsUrl: "https://www.unitel.ao/",
    summary: "Instala cobrança por carteira móvel Unitel Money na tesouraria.",
    capabilities: [
      cap(
        "unitel.wallet",
        "Carteira Unitel Money",
        "Criar planos de mensalidade com canal Unitel Money.",
        "financeiro",
      ),
      cap(
        "unitel.receipts",
        "Recibos móveis",
        "Associar referências Unitel aos recibos da fatura.",
        "faturas",
      ),
    ],
  },
  whatsapp_business: {
    provider: "whatsapp_business",
    installUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    summary: "Avisos via Cloud API (Phone Number ID + token). Sem credenciais → deep-link wa.me.",
    capabilities: [
      cap(
        "whatsapp.class_groups",
        "Salas de turma",
        "Abrir ligação para o grupo de WhatsApp da turma.",
        "pedagogica",
      ),
      cap(
        "whatsapp.notices",
        "Avisos por WhatsApp",
        "Enviar aviso HTTP à equipa/encarregados (ou wa.me se faltar token).",
        "comunicacoes",
      ),
    ],
  },
  resend_email: {
    provider: "resend_email",
    installUrl: "https://resend.com/docs/send-with-nodejs",
    docsUrl: "https://resend.com/docs",
    summary: "Envio transaccional HTTP (API key em merchant). Sem key → cópia para colar.",
    capabilities: [
      cap(
        "resend.send",
        "Disparo de comunicados",
        "Enviar cópia por e-mail no painel de comunicações.",
        "comunicacoes",
      ),
      cap(
        "resend.invoices",
        "E-mail de fatura",
        "Anexar dados bancários e resumo em e-mail ao emitir fatura.",
        "faturas",
      ),
      cap(
        "resend.documents",
        "E-mail de documento",
        "Enviar declaração ou histórico para o e-mail da pessoa.",
        "documentos",
      ),
    ],
  },
  google_calendar: {
    provider: "google_calendar",
    installUrl: "https://calendar.google.com/",
    docsUrl: "https://developers.google.com/calendar",
    summary: "Instala subscrição do calendário lectivo no Google Calendar.",
    capabilities: [
      cap(
        "gcal.subscribe",
        "Subscrição Google",
        "Adicionar o feed ICS ao Google Calendar.",
        "calendario",
      ),
    ],
  },
  apple_calendar: {
    provider: "apple_calendar",
    installUrl: "https://support.apple.com/guide/calendar/welcome/mac",
    docsUrl: "https://support.apple.com/guide/calendar/welcome/mac",
    summary: "Instala feed ICS nativo para Apple Calendar.",
    capabilities: [
      cap(
        "apple.ics",
        "Feed ICS Apple",
        "Subscrever o calendário no iPhone, iPad ou Mac.",
        "calendario",
      ),
    ],
  },
  zoom: {
    provider: "zoom",
    installUrl: "https://developers.zoom.us/",
    docsUrl: "https://developers.zoom.us/docs/api/",
    summary: "Instala reuniões Zoom nos horários das disciplinas.",
    capabilities: [
      cap(
        "zoom.rooms",
        "Salas Zoom",
        "Criar e copiar o link da sala no horário da turma.",
        "pedagogica",
      ),
      cap(
        "zoom.notices",
        "Convites de aula",
        "Enviar o link Zoom nos comunicados da escola.",
        "comunicacoes",
      ),
    ],
  },
  sige: {
    provider: "sige",
    installUrl: "https://www.med.gov.ao/",
    docsUrl: "https://www.med.gov.ao/",
    summary: "Instala o intercâmbio com o sistema nacional de gestão educativa.",
    capabilities: [
      cap(
        "sige.export_classes",
        "Exportar turmas",
        "Preparar o ficheiro de turmas e alunos para o SIGE.",
        "pedagogica",
      ),
      cap(
        "sige.export_students",
        "Exportar alunos",
        "Gerar o lote de matrículas para envio nacional.",
        "alunos",
      ),
    ],
  },
  agt: {
    provider: "agt",
    installUrl: "https://portaldocontribuinte.minfin.gov.ao/",
    docsUrl: "https://agt.minfin.gov.ao/PortalAGT/",
    summary: "Instala NIF e faturação electrónica da AGT nas faturas da escola.",
    capabilities: [
      cap("agt.nif", "NIF da escola", "Usar o NIF institucional nas faturas e recibos.", "faturas"),
      cap(
        "agt.einvoice",
        "Faturação electrónica",
        "Preparar a fatura para o Portal do Contribuinte / software certificado.",
        "faturas",
      ),
    ],
  },
};

export function installPackageFor(provider: string) {
  if (!(provider in integrationInstallPackages)) return null;
  return integrationInstallPackages[provider as CatalogIntegrationId];
}

export function allInstallPackages() {
  return academicIntegrationCatalog.map((item) => integrationInstallPackages[item.id]);
}

export function capabilitiesForModule(module: SigaHostModule, grantedIds: ReadonlySet<string>) {
  return allInstallPackages().flatMap((pack) =>
    pack.capabilities.filter((item) => item.module === module && grantedIds.has(item.id)),
  );
}

export function parseGrantedCapabilities(config: Record<string, unknown> | null | undefined) {
  const raw = config?.["grantedCapabilities"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function publicInstalledProviderIds(
  rows: Array<{ provider?: string | null; status?: string | null }>,
) {
  return rows.flatMap((row) => {
    const provider = row.provider ?? "";
    if (!isCatalogIntegrationId(provider)) return [];
    if (row.status !== "connected" && row.status !== "configured") return [];
    return [provider];
  });
}

/** Só expõe contactos públicos quando a integração correspondente está instalada. */
export function publicSchoolEmail(
  email: string | null | undefined,
  installedProviders: readonly string[],
) {
  if (!installedProviders.includes("resend_email")) return null;
  const trimmed = email?.trim();
  return trimmed || null;
}

export function publicSchoolPhone(
  phone: string | null | undefined,
  installedProviders: readonly string[],
) {
  if (!installedProviders.includes("whatsapp_business")) return null;
  const trimmed = phone?.trim();
  return trimmed || null;
}

export function capabilityIdsFor(provider: CatalogIntegrationId) {
  return integrationInstallPackages[provider].capabilities.map((item) => item.id);
}

export function officialInstallHref(provider: CatalogIntegrationId) {
  const pack = integrationInstallPackages[provider];
  return pack.installUrl || pack.docsUrl;
}
