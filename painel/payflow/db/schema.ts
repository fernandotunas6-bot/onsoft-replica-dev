import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("AOA"),
    description: text("description").notNull(),
    customerName: text("customer_name").notNull().default(""),
    customerEmail: text("customer_email").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    externalReference: text("external_reference").notNull().default(""),
    sourceApp: text("source_app").notNull().default("API"),
    status: text("status").notNull().default("pending"),
    paymentMethod: text("payment_method").notNull().default(""),
    provider: text("provider").notNull().default("unconfigured"),
    checkoutToken: text("checkout_token").notNull(),
    idempotencyKey: text("idempotency_key"),
    metadata: text("metadata").notNull().default("{}"),
    schoolId: text("school_id"),
    studentId: text("student_id"),
    invoiceId: text("invoice_id"),
    providerTransactionId: text("provider_transaction_id"),
    merchantReference: text("merchant_reference"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("payments_checkout_token_unique").on(table.checkoutToken),
    uniqueIndex("payments_idempotency_key_unique").on(table.idempotencyKey),
    index("payments_status_idx").on(table.status),
    index("payments_created_at_idx").on(table.createdAt),
    index("payments_school_student_idx").on(table.schoolId, table.studentId),
    index("payments_invoice_id_idx").on(table.invoiceId),
    uniqueIndex("payments_merchant_reference_unique").on(table.merchantReference),
  ],
);

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: text("payload").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("payment_events_payment_id_idx").on(table.paymentId)],
);

export const schools = sqliteTable(
  "schools",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    publicCode: text("public_code").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("schools_tenant_id_unique").on(table.tenantId),
    uniqueIndex("schools_public_code_unique").on(table.publicCode),
  ],
);

export const bankAccounts = sqliteTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    schoolId: text("school_id").references(() => schools.id, { onDelete: "cascade" }),
    accountHolder: text("account_holder").notNull(),
    bankName: text("bank_name").notNull(),
    iban: text("iban").notNull(),
    currency: text("currency").notNull().default("AOA"),
    status: text("status").notNull().default("active"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("bank_accounts_scope_status_idx").on(table.scope, table.status, table.isPrimary),
    index("bank_accounts_school_status_idx").on(table.schoolId, table.status, table.isPrimary),
  ],
);

export const bankTransferInstructions = sqliteTable(
  "bank_transfer_instructions",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    bankAccountId: text("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    transferReference: text("transfer_reference").notNull(),
    expectedAmountMinor: integer("expected_amount_minor").notNull(),
    currency: text("currency").notNull().default("AOA"),
    status: text("status").notNull().default("awaiting_transfer"),
    expiresAt: text("expires_at").notNull(),
    verifiedAt: text("verified_at"),
    verifiedBy: text("verified_by"),
    verificationSource: text("verification_source"),
    bankTransactionId: text("bank_transaction_id"),
    statementBookedAt: text("statement_booked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("bank_transfer_instructions_payment_unique").on(table.paymentId),
    uniqueIndex("bank_transfer_instructions_reference_unique").on(table.transferReference),
    uniqueIndex("bank_transfer_instructions_transaction_unique").on(table.bankTransactionId),
    index("bank_transfer_instructions_status_idx").on(table.status, table.createdAt),
  ],
);

export const bankTransferProofs = sqliteTable(
  "bank_transfer_proofs",
  {
    id: text("id").primaryKey(),
    instructionId: text("instruction_id")
      .notNull()
      .references(() => bankTransferInstructions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status").notNull().default("submitted"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    reviewedAt: text("reviewed_at"),
  },
  (table) => [
    uniqueIndex("bank_transfer_proofs_object_key_unique").on(table.objectKey),
    index("bank_transfer_proofs_instruction_idx").on(table.instructionId, table.status),
  ],
);

export const students = sqliteTable(
  "students",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentCode: text("student_code").notNull(),
    fullName: text("full_name").notNull(),
    className: text("class_name").notNull().default(""),
    paymentPinHash: text("payment_pin_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("students_school_code_unique").on(table.schoolId, table.studentCode),
    index("students_school_status_idx").on(table.schoolId, table.status),
  ],
);

export const studentInvoices = sqliteTable(
  "student_invoices",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    invoiceCode: text("invoice_code").notNull(),
    description: text("description").notNull(),
    period: text("period").notNull().default(""),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("AOA"),
    dueDate: text("due_date").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("student_invoices_school_code_unique").on(table.schoolId, table.invoiceCode),
    index("student_invoices_student_status_idx").on(table.studentId, table.status),
  ],
);

export const studentPaymentSessions = sqliteTable(
  "student_payment_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    schoolId: text("school_id").notNull(),
    studentId: text("student_id").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("student_payment_sessions_student_idx").on(table.schoolId, table.studentId),
    index("student_payment_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const studentAccessLimits = sqliteTable(
  "student_access_limits",
  {
    keyHash: text("key_hash").primaryKey(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
    lockedUntil: text("locked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("student_access_limits_updated_at_idx").on(table.updatedAt)],
);

export const emisTransactions = sqliteTable(
  "emis_transactions",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    merchantReference: text("merchant_reference").notNull(),
    providerTransactionId: text("provider_transaction_id").notNull(),
    method: text("method").notNull(),
    status: text("status").notNull().default("created"),
    responseCode: text("response_code").notNull().default("UNCONFIGURED"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("emis_transactions_payment_unique").on(table.paymentId),
    uniqueIndex("emis_transactions_merchant_reference_unique").on(table.merchantReference),
    uniqueIndex("emis_transactions_provider_id_unique").on(table.providerTransactionId),
    index("emis_transactions_status_idx").on(table.status),
  ],
);

export const paymentReceipts = sqliteTable(
  "payment_receipts",
  {
    id: text("id").primaryKey(),
    receiptCode: text("receipt_code").notNull(),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    schoolId: text("school_id"),
    studentId: text("student_id"),
    invoiceId: text("invoice_id"),
    issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("payment_receipts_code_unique").on(table.receiptCode),
    uniqueIndex("payment_receipts_payment_unique").on(table.paymentId),
    index("payment_receipts_student_idx").on(table.schoolId, table.studentId),
  ],
);
