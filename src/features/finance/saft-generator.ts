import { z } from "zod";
import { schoolTodayIso } from "@/lib/school-date";

export const generateSaftInputSchema = z.object({
  fiscalYear: z
    .number()
    .int()
    .min(2020)
    .max(2100)
    .default(() => new Date().getFullYear()),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  softwareCertificateNumber: z.string().trim().max(80).optional(),
});
export type GenerateSaftInput = z.infer<typeof generateSaftInputSchema>;

export type SaftSchoolInfo = {
  nif: string;
  name: string;
  address?: string;
  city?: string;
};

export type SaftInvoiceItem = {
  id: string;
  invoiceNo: string;
  invoiceType: "FT" | "FR" | "FS" | "VD" | "NC" | "ND";
  date: string;
  customerName: string;
  customerNif?: string | null;
  studentId?: string;
  description: string;
  amount: number;
  status: "N" | "A"; // N = Normal, A = Anulada
  /** Data do estado (anulação); por omissão, a da fatura. */
  statusDate?: string;
};

export type SaftPaymentItem = {
  id: string;
  paymentRefNo: string;
  paymentType: "RG" | "RC"; // RG = Recibo Geral, RC = Recibo de Caixa
  date: string;
  customerName: string;
  customerNif?: string | null;
  studentId?: string;
  description?: string;
  amount: number;
  sourceInvoiceNo?: string;
  /** Data da fatura liquidada (não a do recibo). */
  sourceInvoiceDate?: string;
  status: "N" | "A"; // N = Normal, A = Anulada
  statusDate?: string;
};

/**
 * O SIGA não assina documentos com chave certificada pela AGT: sem número de
 * certificado configurado vai "0" (valor que a norma prevê quando não se
 * aplica), e o Hash vai sempre "0" com HashControl "0" — nunca um certificado
 * ou uma assinatura inventados.
 */
export const SAFT_NOT_CERTIFIED = "0";
const UNKNOWN = "Desconhecido";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSaftAoXml(
  school: SaftSchoolInfo,
  invoices: SaftInvoiceItem[],
  input: GenerateSaftInput,
  payments: SaftPaymentItem[] = [],
): string {
  const year = input.fiscalYear;
  const startDate = input.startDate ?? `${year}-01-01`;
  const endDate = input.endDate ?? `${year}-12-31`;
  const dateCreated = schoolTodayIso();

  const schoolNif = school.nif?.trim() || "999999999";
  const schoolName = school.name?.trim() || UNKNOWN;
  const schoolAddress = school.address?.trim() || UNKNOWN;
  const schoolCity = school.city?.trim() || UNKNOWN;

  // Build Customers map
  const customerMap = new Map<string, { id: string; name: string; nif: string }>();
  for (const inv of invoices) {
    const key = inv.customerNif || inv.studentId || inv.customerName;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: `CLI-${customerMap.size + 1}`,
        name: inv.customerName,
        nif: inv.customerNif || "999999999",
      });
    }
  }
  for (const pay of payments) {
    const key = pay.customerNif || pay.studentId || pay.customerName;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: `CLI-${customerMap.size + 1}`,
        name: pay.customerName,
        nif: pay.customerNif || "999999999",
      });
    }
  }

  // Calculate totals
  let totalCredit = 0;
  for (const inv of invoices) {
    if (inv.status === "N") {
      totalCredit += inv.amount;
    }
  }
  let totalPaymentCredit = 0;
  for (const pay of payments) {
    if (pay.status === "N") {
      totalPaymentCredit += pay.amount;
    }
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n`;
  xml += `  <Header>\n`;
  xml += `    <AuditFileCountrySchemaHeader>AO</AuditFileCountrySchemaHeader>\n`;
  xml += `    <AuditFileVersion>1.01_01</AuditFileVersion>\n`;
  xml += `    <CompanyID>${escapeXml(schoolNif)}</CompanyID>\n`;
  xml += `    <TaxRegistrationNumber>${escapeXml(schoolNif)}</TaxRegistrationNumber>\n`;
  xml += `    <CompanyName>${escapeXml(schoolName)}</CompanyName>\n`;
  xml += `    <BusinessName>${escapeXml(schoolName)}</BusinessName>\n`;
  xml += `    <CompanyAddress>\n`;
  xml += `      <AddressDetail>${escapeXml(schoolAddress)}</AddressDetail>\n`;
  xml += `      <City>${escapeXml(schoolCity)}</City>\n`;
  xml += `      <Country>AO</Country>\n`;
  xml += `    </CompanyAddress>\n`;
  xml += `    <FiscalYear>${year}</FiscalYear>\n`;
  xml += `    <StartDate>${startDate}</StartDate>\n`;
  xml += `    <EndDate>${endDate}</EndDate>\n`;
  xml += `    <CurrencyCode>AOA</CurrencyCode>\n`;
  xml += `    <DateCreated>${dateCreated}</DateCreated>\n`;
  xml += `    <TaxEntity>Global</TaxEntity>\n`;
  xml += `    <ProductCompanyID>SIGA - Sistema Integrado de Gestao Escolar</ProductCompanyID>\n`;
  xml += `    <ProductID>SIGA/AO</ProductID>\n`;
  xml += `    <ProductVersion>2026.1</ProductVersion>\n`;
  xml += `    <HeaderComment>Ficheiro SAFT-AO gerado pelo SIGA per Decreto Presidencial 312/18 AGT</HeaderComment>\n`;
  xml += `    <SoftwareCertificateNumber>${escapeXml(input.softwareCertificateNumber?.trim() || SAFT_NOT_CERTIFIED)}</SoftwareCertificateNumber>\n`;
  xml += `  </Header>\n`;

  xml += `  <MasterFiles>\n`;
  // Customers
  for (const [, cust] of customerMap) {
    xml += `    <Customer>\n`;
    xml += `      <CustomerID>${escapeXml(cust.id)}</CustomerID>\n`;
    xml += `      <AccountID>21.1</AccountID>\n`;
    xml += `      <CustomerTaxID>${escapeXml(cust.nif)}</CustomerTaxID>\n`;
    xml += `      <CompanyName>${escapeXml(cust.name)}</CompanyName>\n`;
    xml += `      <BillingAddress>\n`;
    xml += `        <AddressDetail>${UNKNOWN}</AddressDetail>\n`;
    xml += `        <City>${UNKNOWN}</City>\n`;
    xml += `        <Country>AO</Country>\n`;
    xml += `      </BillingAddress>\n`;
    xml += `      <SelfBillingIndicator>0</SelfBillingIndicator>\n`;
    xml += `    </Customer>\n`;
  }

  // Products (Services)
  xml += `    <Product>\n`;
  xml += `      <ProductType>S</ProductType>\n`;
  xml += `      <ProductCode>PROPINA</ProductCode>\n`;
  xml += `      <Group>Ensino</Group>\n`;
  xml += `      <ProductDescription>Propinas e Emolumentos Escolares</ProductDescription>\n`;
  xml += `      <ProductNumberCode>PROPINA</ProductNumberCode>\n`;
  xml += `    </Product>\n`;

  // TaxTable (IVA Isento M00 per Art. 12 CIVA Angola)
  xml += `    <TaxTable>\n`;
  xml += `      <TaxTableEntry>\n`;
  xml += `        <TaxType>IVA</TaxType>\n`;
  xml += `        <TaxCountryRegion>AO</TaxCountryRegion>\n`;
  xml += `        <TaxCode>ISE</TaxCode>\n`;
  xml += `        <Description>Isento nos termos da alinea e) do art 12 CIVA</Description>\n`;
  xml += `        <TaxPercentage>0.00</TaxPercentage>\n`;
  xml += `      </TaxTableEntry>\n`;
  xml += `    </TaxTable>\n`;
  xml += `  </MasterFiles>\n`;

  // SourceDocuments
  xml += `  <SourceDocuments>\n`;
  xml += `    <SalesInvoices>\n`;
  xml += `      <NumberOfEntries>${invoices.length}</NumberOfEntries>\n`;
  xml += `      <TotalDebit>0.00</TotalDebit>\n`;
  xml += `      <TotalCredit>${totalCredit.toFixed(2)}</TotalCredit>\n`;

  for (const inv of invoices) {
    const custKey = inv.customerNif || inv.studentId || inv.customerName;
    const cust = customerMap.get(custKey);
    const custId = cust ? cust.id : "CLI-1";

    xml += `      <Invoice>\n`;
    xml += `        <InvoiceNo>${escapeXml(inv.invoiceNo)}</InvoiceNo>\n`;
    xml += `        <DocumentStatus>\n`;
    xml += `          <InvoiceStatus>${inv.status}</InvoiceStatus>\n`;
    xml += `          <InvoiceStatusDate>${inv.statusDate ?? inv.date}T00:00:00</InvoiceStatusDate>\n`;
    xml += `          <SourceID>SIGA</SourceID>\n`;
    xml += `          <SourceBilling>P</SourceBilling>\n`;
    xml += `        </DocumentStatus>\n`;
    xml += `        <Hash>0</Hash>\n`;
    xml += `        <HashControl>0</HashControl>\n`;
    xml += `        <Period>${inv.date.slice(5, 7)}</Period>\n`;
    xml += `        <InvoiceDate>${inv.date}</InvoiceDate>\n`;
    xml += `        <InvoiceType>${inv.invoiceType}</InvoiceType>\n`;
    xml += `        <SourceID>SIGA</SourceID>\n`;
    xml += `        <SystemEntryDate>${inv.date}T00:00:00</SystemEntryDate>\n`;
    xml += `        <CustomerID>${escapeXml(custId)}</CustomerID>\n`;

    xml += `        <Line>\n`;
    xml += `          <LineNumber>1</LineNumber>\n`;
    xml += `          <ProductCode>PROPINA</ProductCode>\n`;
    xml += `          <ProductDescription>${escapeXml(inv.description)}</ProductDescription>\n`;
    xml += `          <Quantity>1</Quantity>\n`;
    xml += `          <UnitOfMeasure>Unidade</UnitOfMeasure>\n`;
    xml += `          <UnitPrice>${inv.amount.toFixed(2)}</UnitPrice>\n`;
    xml += `          <TaxPointDate>${inv.date}</TaxPointDate>\n`;
    xml += `          <Description>${escapeXml(inv.description)}</Description>\n`;
    xml += `          <CreditAmount>${inv.amount.toFixed(2)}</CreditAmount>\n`;
    xml += `          <Tax>\n`;
    xml += `            <TaxType>IVA</TaxType>\n`;
    xml += `            <TaxCountryRegion>AO</TaxCountryRegion>\n`;
    xml += `            <TaxCode>ISE</TaxCode>\n`;
    xml += `            <TaxPercentage>0.00</TaxPercentage>\n`;
    xml += `          </Tax>\n`;
    xml += `          <TaxExemptionReason>Isento nos termos da alinea e) do art 12 CIVA</TaxExemptionReason>\n`;
    xml += `          <TaxExemptionCode>M00</TaxExemptionCode>\n`;
    xml += `        </Line>\n`;

    xml += `        <DocumentTotals>\n`;
    xml += `          <TaxPayable>0.00</TaxPayable>\n`;
    xml += `          <NetTotal>${inv.amount.toFixed(2)}</NetTotal>\n`;
    xml += `          <GrossTotal>${inv.amount.toFixed(2)}</GrossTotal>\n`;
    xml += `        </DocumentTotals>\n`;
    xml += `      </Invoice>\n`;
  }

  xml += `    </SalesInvoices>\n`;

  if (payments.length > 0) {
    xml += `    <Payments>\n`;
    xml += `      <NumberOfEntries>${payments.length}</NumberOfEntries>\n`;
    xml += `      <TotalDebit>0.00</TotalDebit>\n`;
    xml += `      <TotalCredit>${totalPaymentCredit.toFixed(2)}</TotalCredit>\n`;

    for (const pay of payments) {
      const custKey = pay.customerNif || pay.studentId || pay.customerName;
      const cust = customerMap.get(custKey);
      const custId = cust ? cust.id : "CLI-1";
      const payPeriod = pay.date.slice(5, 7);

      xml += `      <Payment>\n`;
      xml += `        <PaymentRefNo>${escapeXml(pay.paymentRefNo)}</PaymentRefNo>\n`;
      xml += `        <Period>${payPeriod}</Period>\n`;
      xml += `        <TransactionDate>${pay.date}</TransactionDate>\n`;
      xml += `        <PaymentType>${pay.paymentType}</PaymentType>\n`;
      xml += `        <PaymentStatus>\n`;
      xml += `          <PaymentStatus>${pay.status}</PaymentStatus>\n`;
      xml += `          <PaymentStatusDate>${pay.statusDate ?? pay.date}T00:00:00</PaymentStatusDate>\n`;
      xml += `          <SourceID>SIGA</SourceID>\n`;
      xml += `          <SourcePayment>P</SourcePayment>\n`;
      xml += `        </PaymentStatus>\n`;
      xml += `        <SourceID>SIGA</SourceID>\n`;
      xml += `        <SystemEntryDate>${pay.date}T00:00:00</SystemEntryDate>\n`;
      xml += `        <CustomerID>${escapeXml(custId)}</CustomerID>\n`;
      xml += `        <Line>\n`;
      xml += `          <LineNumber>1</LineNumber>\n`;
      if (pay.sourceInvoiceNo) {
        xml += `          <SourceDocumentID>\n`;
        xml += `            <OriginatingON>${escapeXml(pay.sourceInvoiceNo)}</OriginatingON>\n`;
        xml += `            <InvoiceDate>${pay.sourceInvoiceDate ?? pay.date}</InvoiceDate>\n`;
        xml += `            <Description>${escapeXml(pay.description || "Propina")}</Description>\n`;
        xml += `          </SourceDocumentID>\n`;
      }
      xml += `          <CreditAmount>${pay.amount.toFixed(2)}</CreditAmount>\n`;
      xml += `        </Line>\n`;
      xml += `        <DocumentTotals>\n`;
      xml += `          <TaxPayable>0.00</TaxPayable>\n`;
      xml += `          <NetTotal>${pay.amount.toFixed(2)}</NetTotal>\n`;
      xml += `          <GrossTotal>${pay.amount.toFixed(2)}</GrossTotal>\n`;
      xml += `          <Settlement>\n`;
      xml += `            <SettlementDiscount>0.00</SettlementDiscount>\n`;
      xml += `            <SettlementAmount>${pay.amount.toFixed(2)}</SettlementAmount>\n`;
      xml += `          </Settlement>\n`;
      xml += `        </DocumentTotals>\n`;
      xml += `      </Payment>\n`;
    }

    xml += `    </Payments>\n`;
  }

  xml += `  </SourceDocuments>\n`;
  xml += `</AuditFile>`;

  return xml;
}
