/**
 * Validador Estrutural Offline do SAF-T AO (Angola)
 * Baseado na Portaria n.º 63/19 e especificações técnicas da AGT (Versão 1.01_01).
 */

export interface SaftValidationError {
  code: string;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface SaftValidationResult {
  valid: boolean;
  version: string | null;
  taxRegistrationNumber: string | null;
  companyName: string | null;
  totalInvoices: number;
  totalPayments: number;
  totalLines: number;
  grossTotal: number;
  grossPaymentsTotal: number;
  errors: SaftValidationError[];
  warnings: SaftValidationError[];
}

export function validateSaftAoXml(xml: string): SaftValidationResult {
  const errors: SaftValidationError[] = [];
  const warnings: SaftValidationError[] = [];

  if (!xml || !xml.trim()) {
    return {
      valid: false,
      version: null,
      taxRegistrationNumber: null,
      companyName: null,
      totalInvoices: 0,
      totalPayments: 0,
      totalLines: 0,
      grossTotal: 0,
      grossPaymentsTotal: 0,
      errors: [
        {
          code: "EMPTY_XML",
          field: "root",
          message: "O conteúdo do ficheiro SAF-T está vazio.",
          severity: "error",
        },
      ],
      warnings: [],
    };
  }

  // 1. Tag Raiz
  if (!xml.includes("<AuditFile") || !xml.includes("</AuditFile>")) {
    errors.push({
      code: "INVALID_ROOT",
      field: "AuditFile",
      message: "Elemento raiz <AuditFile> não encontrado ou mal formado.",
      severity: "error",
    });
  }

  // 2. Extrair Tags com regex simples e segura
  const getTag = (tag: string, content = xml): string | null => {
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(content);
    return match && match[1] ? match[1].trim() : null;
  };

  // Header Validation
  const header = getTag("Header");
  let version: string | null = null;
  let taxRegistrationNumber: string | null = null;
  let companyName: string | null = null;

  if (!header) {
    errors.push({
      code: "MISSING_HEADER",
      field: "Header",
      message: "Secção <Header> obrigatória não encontrada no ficheiro.",
      severity: "error",
    });
  } else {
    version = getTag("AuditFileVersion", header);
    if (!version) {
      errors.push({
        code: "MISSING_VERSION",
        field: "Header.AuditFileVersion",
        message: "Versão do SAF-T <AuditFileVersion> não especificada.",
        severity: "error",
      });
    } else if (version !== "1.01_01") {
      warnings.push({
        code: "UNEXPECTED_VERSION",
        field: "Header.AuditFileVersion",
        message: `Versão ${version} encontrada. A versão recomendada pela AGT é 1.01_01.`,
        severity: "warning",
      });
    }

    companyName = getTag("CompanyName", header);
    if (!companyName) {
      errors.push({
        code: "MISSING_COMPANY_NAME",
        field: "Header.CompanyName",
        message: "Nome da instituição/escola <CompanyName> em falta.",
        severity: "error",
      });
    }

    taxRegistrationNumber = getTag("TaxRegistrationNumber", header);
    if (!taxRegistrationNumber) {
      errors.push({
        code: "MISSING_NIF",
        field: "Header.TaxRegistrationNumber",
        message: "NIF da instituição <TaxRegistrationNumber> em falta no cabeçalho.",
        severity: "error",
      });
    } else if (!/^[0-9A-Z]{9,14}$/i.test(taxRegistrationNumber)) {
      warnings.push({
        code: "INVALID_NIF_FORMAT",
        field: "Header.TaxRegistrationNumber",
        message: `NIF '${taxRegistrationNumber}' pode não cumprir o formato fiscal padrão de Angola.`,
        severity: "warning",
      });
    }

    const fiscalYear = getTag("FiscalYear", header);
    if (!fiscalYear || !/^\d{4}$/.test(fiscalYear)) {
      errors.push({
        code: "INVALID_FISCAL_YEAR",
        field: "Header.FiscalYear",
        message: "Ano fiscal <FiscalYear> deve conter 4 dígitos numéricos.",
        severity: "error",
      });
    }

    const softwareCertificateNumber = getTag("SoftwareCertificateNumber", header);
    if (!softwareCertificateNumber) {
      warnings.push({
        code: "MISSING_SOFTWARE_CERTIFICATE",
        field: "Header.SoftwareCertificateNumber",
        message: "Número de certificação do software não encontrado.",
        severity: "warning",
      });
    }
  }

  // MasterFiles Validation
  const masterFiles = getTag("MasterFiles");
  if (!masterFiles) {
    warnings.push({
      code: "MISSING_MASTER_FILES",
      field: "MasterFiles",
      message: "Secção <MasterFiles> não encontrada.",
      severity: "warning",
    });
  }

  // SourceDocuments (SalesInvoices and Payments) Validation
  const sourceDocs = getTag("SourceDocuments");
  let totalInvoices = 0;
  let totalPayments = 0;
  let totalLines = 0;
  let grossTotal = 0;
  let grossPaymentsTotal = 0;

  if (sourceDocs) {
    // 1. SalesInvoices
    const salesInvoices = getTag("SalesInvoices", sourceDocs);
    if (salesInvoices) {
      const numberOfEntries = Number(getTag("NumberOfEntries", salesInvoices) || 0);
      const invoiceMatches = salesInvoices.match(/<Invoice[\s>][\s\S]*?<\/Invoice>/gi) ?? [];
      totalInvoices = invoiceMatches.length;

      if (numberOfEntries !== totalInvoices) {
        errors.push({
          code: "INVOICE_COUNT_MISMATCH",
          field: "SalesInvoices.NumberOfEntries",
          message: `Contagem de faturas declarada (${numberOfEntries}) difere do número real de elementos <Invoice> (${totalInvoices}).`,
          severity: "error",
        });
      }

      for (let i = 0; i < invoiceMatches.length; i++) {
        const invXml = invoiceMatches[i] || "";
        const invoiceNo = getTag("InvoiceNo", invXml) || `Fatura #${i + 1}`;
        const invoiceDate = getTag("InvoiceDate", invXml);
        const invoiceStatus = getTag("InvoiceStatus", invXml);
        const hash = getTag("Hash", invXml);

        if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
          errors.push({
            code: "INVALID_INVOICE_DATE",
            field: `Invoice[${invoiceNo}].InvoiceDate`,
            message: `Data da fatura ${invoiceNo} inválida ou ausente (esperado AAAA-MM-DD).`,
            severity: "error",
          });
        }

        if (!invoiceStatus) {
          warnings.push({
            code: "MISSING_INVOICE_STATUS",
            field: `Invoice[${invoiceNo}].DocumentStatus.InvoiceStatus`,
            message: `Estado da fatura ${invoiceNo} não indicado (esperado 'N' ou 'A').`,
            severity: "warning",
          });
        }

        if (!hash) {
          warnings.push({
            code: "MISSING_HASH",
            field: `Invoice[${invoiceNo}].Hash`,
            message: `Hash de assinatura da fatura ${invoiceNo} ausente.`,
            severity: "warning",
          });
        }

        const lines = invXml.match(/<Line[\s>][\s\S]*?<\/Line>/gi) ?? [];
        totalLines += lines.length;

        const docTotals = getTag("DocumentTotals", invXml);
        if (docTotals) {
          const gTot = Number(getTag("GrossTotal", docTotals) || 0);
          if (Number.isFinite(gTot)) grossTotal += gTot;
        }
      }
    }

    // 2. Payments (Recibos / Caixa)
    const payments = getTag("Payments", sourceDocs);
    if (payments) {
      const numberOfEntries = Number(getTag("NumberOfEntries", payments) || 0);
      const paymentMatches = payments.match(/<Payment[\s>][\s\S]*?<\/Payment>/gi) ?? [];
      totalPayments = paymentMatches.length;

      if (numberOfEntries !== totalPayments) {
        errors.push({
          code: "PAYMENT_COUNT_MISMATCH",
          field: "Payments.NumberOfEntries",
          message: `Contagem de recibos declarada (${numberOfEntries}) difere do número real de elementos <Payment> (${totalPayments}).`,
          severity: "error",
        });
      }

      for (let i = 0; i < paymentMatches.length; i++) {
        const payXml = paymentMatches[i] || "";
        const payRefNo = getTag("PaymentRefNo", payXml) || `Recibo #${i + 1}`;
        const txDate = getTag("TransactionDate", payXml);
        const payType = getTag("PaymentType", payXml);

        if (!txDate || !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
          errors.push({
            code: "INVALID_PAYMENT_DATE",
            field: `Payment[${payRefNo}].TransactionDate`,
            message: `Data do recibo ${payRefNo} inválida ou ausente (esperado AAAA-MM-DD).`,
            severity: "error",
          });
        }

        if (!payType || (payType !== "RG" && payType !== "RC")) {
          warnings.push({
            code: "UNEXPECTED_PAYMENT_TYPE",
            field: `Payment[${payRefNo}].PaymentType`,
            message: `Tipo de recibo ${payRefNo} não usual (esperado 'RG' ou 'RC').`,
            severity: "warning",
          });
        }

        const docTotals = getTag("DocumentTotals", payXml);
        if (docTotals) {
          const gTot = Number(getTag("GrossTotal", docTotals) || 0);
          if (Number.isFinite(gTot)) grossPaymentsTotal += gTot;
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    version,
    taxRegistrationNumber,
    companyName,
    totalInvoices,
    totalPayments,
    totalLines,
    grossTotal: Number(grossTotal.toFixed(2)),
    grossPaymentsTotal: Number(grossPaymentsTotal.toFixed(2)),
    errors,
    warnings,
  };
}
