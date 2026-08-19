import { z } from "zod";

export const generateSaftInputSchema = z.object({
  fiscalYear: z.number().int().min(2020).max(2100).default(() => new Date().getFullYear()),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  invoiceType: "FT" | "FR" | "VD";
  date: string;
  customerName: string;
  customerNif?: string | null;
  studentId?: string;
  description: string;
  amount: number;
  status: "N" | "A"; // N = Normal, A = Anulada
};

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
): string {
  const year = input.fiscalYear;
  const startDate = input.startDate ?? `${year}-01-01`;
  const endDate = input.endDate ?? `${year}-12-31`;
  const dateCreated = new Date().toISOString().slice(0, 10);

  const schoolNif = school.nif?.trim() || "999999999";
  const schoolName = school.name?.trim() || "Instituição Escolar SIGA";
  const schoolAddress = school.address?.trim() || "Luanda";
  const schoolCity = school.city?.trim() || "Luanda";

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

  // Calculate totals
  let totalCredit = 0;
  for (const inv of invoices) {
    if (inv.status === "N") {
      totalCredit += inv.amount;
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
  xml += `    <SoftwareCertificateNumber>0/AGT/2026</SoftwareCertificateNumber>\n`;
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
    xml += `        <AddressDetail>${escapeXml(schoolCity)}</AddressDetail>\n`;
    xml += `        <City>${escapeXml(schoolCity)}</City>\n`;
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
    xml += `          <InvoiceStatusDate>${inv.date}T00:00:00</InvoiceStatusDate>\n`;
    xml += `          <SourceID>SIGA</SourceID>\n`;
    xml += `          <SourceBilling>P</SourceBilling>\n`;
    xml += `        </DocumentStatus>\n`;
    xml += `        <Hash>0</Hash>\n`;
    xml += `        <HashControl>1</HashControl>\n`;
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
  xml += `  </SourceDocuments>\n`;
  xml += `</AuditFile>`;

  return xml;
}
