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
  | "arquivos";

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
};

function cap(
  id: string,
  label: string,
  description: string,
  module: SigaHostModule,
): IntegrationCapability {
  return { id, label, description, module, moduleLabel: moduleLabel[module] };
}

export const integrationInstallPackages: Record<
  CatalogIntegrationId,
  IntegrationInstallPackage
> = {
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
    summary: "Instala salas de turma e avisos a encarregados via WhatsApp Business.",
    capabilities: [
      cap(
        "whatsapp.class_groups",
        "Salas de turma",
        "Ligar e abrir grupos WhatsApp em cada turma.",
        "pedagogica",
      ),
      cap(
        "whatsapp.notices",
        "Avisos a encarregados",
        "Enviar comunicados da escola pelo WhatsApp.",
        "comunicacoes",
      ),
    ],
  },
  google_classroom: {
    provider: "google_classroom",
    installUrl: "https://classroom.google.com/",
    docsUrl: "https://developers.google.com/classroom",
    summary: "Instala atalhos de turmas e trabalhos do Google Classroom na pedagógica.",
    capabilities: [
      cap(
        "classroom.classes",
        "Turmas Classroom",
        "Abrir e sincronizar a turma SIGA com o Classroom.",
        "pedagogica",
      ),
      cap(
        "classroom.work",
        "Trabalhos e materiais",
        "Publicar materiais da disciplina no Classroom.",
        "pedagogica",
      ),
    ],
  },
  moodle: {
    provider: "moodle",
    installUrl: "https://docs.moodle.org/en/Web_services",
    docsUrl: "https://docs.moodle.org/en/Web_services",
    summary: "Instala o LMS Moodle nas disciplinas e avaliações.",
    capabilities: [
      cap(
        "moodle.courses",
        "Disciplinas Moodle",
        "Abrir o curso Moodle a partir da turma ou disciplina.",
        "pedagogica",
      ),
      cap(
        "moodle.grades",
        "Notas Moodle",
        "Importar avaliações do Moodle para a pauta.",
        "pedagogica",
      ),
    ],
  },
  canvas: {
    provider: "canvas",
    installUrl: "https://www.instructure.com/canvas",
    docsUrl: "https://canvas.instructure.com/doc/api/",
    summary: "Instala o Canvas LMS para ensino híbrido.",
    capabilities: [
      cap(
        "canvas.courses",
        "Cursos Canvas",
        "Abrir o curso Canvas da disciplina.",
        "pedagogica",
      ),
      cap(
        "canvas.assignments",
        "Trabalhos Canvas",
        "Ligar trabalhos do Canvas à pauta de notas.",
        "pedagogica",
      ),
    ],
  },
  microsoft_365_education: {
    provider: "microsoft_365_education",
    installUrl: "https://learn.microsoft.com/microsoft-365/education/",
    docsUrl: "https://learn.microsoft.com/graph/auth-v2-user",
    summary: "Instala Teams, Outlook e OneDrive nos comunicados e na pedagógica.",
    capabilities: [
      cap(
        "m365.outlook",
        "Outlook da escola",
        "Enviar comunicados pelo correio Microsoft 365.",
        "comunicacoes",
      ),
      cap(
        "m365.onedrive",
        "Materiais OneDrive",
        "Abrir a biblioteca de arquivos da escola (SGA ou este dispositivo).",
        "arquivos",
      ),
    ],
  },
  google_calendar: {
    provider: "google_calendar",
    installUrl: "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
    docsUrl: "https://support.google.com/calendar/answer/37100",
    summary: "Instala a sincronização do calendário lectivo com o Google Calendar.",
    capabilities: [
      cap(
        "gcal.subscribe",
        "Subscrever ICS no Google",
        "Copiar o feed SIGA e abrir o Google Calendar.",
        "calendario",
      ),
    ],
  },
  apple_calendar: {
    provider: "apple_calendar",
    installUrl: "https://support.apple.com/guide/iphone/use-icloud-for-calendar-iph3d1110d4/ios",
    docsUrl: "https://support.apple.com/guide/iphone/use-icloud-for-calendar-iph3d1110d4/ios",
    summary: "Instala o feed ICS para iPhone, iPad e calendário nativo.",
    capabilities: [
      cap(
        "apple.ics",
        "Feed ICS Apple",
        "Copiar o link ICS para o calendário do telemóvel.",
        "calendario",
      ),
    ],
  },
  resend_email: {
    provider: "resend_email",
    installUrl: "https://resend.com/docs/send-with-nodejs",
    docsUrl: "https://resend.com/docs",
    summary: "Instala envio transaccional de recibos, avisos e convites.",
    capabilities: [
      cap(
        "resend.send",
        "E-mail transaccional",
        "Enviar comunicados e recibos pelo Resend.",
        "comunicacoes",
      ),
      cap(
        "resend.invoices",
        "Recibos por e-mail",
        "Enviar a fatura e o recibo para o encarregado.",
        "faturas",
      ),
      cap(
        "resend.documents",
        "Declarações por e-mail",
        "Enviar declarações e certificados emitidos ao encarregado.",
        "documentos",
      ),
    ],
  },
  zoom: {
    provider: "zoom",
    installUrl: "https://marketplace.zoom.us/docs/guides/build/oauth-app/",
    docsUrl: "https://marketplace.zoom.us/docs/api-reference/introduction",
    summary: "Instala salas virtuais Zoom nos horários e nas turmas.",
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
  teams: {
    provider: "teams",
    installUrl: "https://learn.microsoft.com/microsoftteams/platform/concepts/build-and-test/apps-package",
    docsUrl: "https://learn.microsoft.com/graph/api/resources/onlinemeeting",
    summary: "Instala reuniões e turmas Microsoft Teams nos horários.",
    capabilities: [
      cap(
        "teams.meetings",
        "Reuniões Teams",
        "Criar reunião Teams a partir do horário.",
        "pedagogica",
      ),
      cap(
        "teams.classes",
        "Turma Teams",
        "Abrir a equipa da turma no Microsoft Teams.",
        "pedagogica",
      ),
    ],
  },
  turnitin: {
    provider: "turnitin",
    installUrl: "https://developers.turnitin.com/",
    docsUrl: "https://developers.turnitin.com/",
    summary: "Instala verificação de originalidade na pauta e nos trabalhos.",
    capabilities: [
      cap(
        "turnitin.originality",
        "Originalidade",
        "Enviar trabalhos da pauta para o Turnitin.",
        "pedagogica",
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
      cap(
        "agt.nif",
        "NIF da escola",
        "Usar o NIF institucional nas faturas e recibos.",
        "faturas",
      ),
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

export function capabilitiesForModule(
  module: SigaHostModule,
  grantedIds: ReadonlySet<string>,
) {
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
