import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { bankAccounts, schools, studentInvoices, students } from "@/db/schema";
import { validateAngolaIban } from "@/lib/angola-banking";
import { isIntegrationAuthorized, jsonResponse, corsHeaders } from "@/lib/payflow";
import { hashPaymentPin } from "@/lib/identifiers";

export const dynamic = "force-dynamic";

const schoolBankAccountSchema = z.object({
  id: z.string().trim().min(3).max(100),
  account_holder: z.string().trim().min(2).max(160),
  bank_name: z.string().trim().min(2).max(120),
  iban: z
    .string()
    .trim()
    .min(8)
    .max(40)
    .refine((value) => validateAngolaIban(value).ok, "IBAN angolano inválido."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("AOA"),
  status: z.enum(["active", "inactive"]).default("active"),
  is_primary: z.boolean().default(true),
});

const syncSchema = z.object({
  school: z.object({
    id: z.string().trim().min(3).max(100),
    tenant_id: z.string().trim().min(3).max(100),
    code: z.string().trim().toUpperCase().min(3).max(30),
    name: z.string().trim().min(2).max(160),
  }),
  student: z.object({
    id: z.string().trim().min(3).max(100),
    code: z.string().regex(/^\d{7}$/),
    enrollment_id: z.string().trim().min(3).max(100),
    academic_year_id: z.string().trim().min(3).max(100),
    class_id: z.string().trim().min(3).max(100),
    guardian_id: z.string().trim().min(3).max(100).nullable().optional().default(null),
    full_name: z.string().trim().min(2).max(160),
    class_name: z.string().trim().max(120).optional().default(""),
    enrollment_status: z
      .enum(["pending", "active", "suspended", "transferred", "withdrawn", "completed", "cancelled"])
      .default("active"),
    financial_responsible: z
      .object({
        name: z.string().trim().min(2).max(160),
        email: z.string().trim().email().or(z.literal("")).optional().default(""),
        phone: z.string().trim().max(30).optional().default(""),
      })
      .optional(),
    payment_pin: z.string().regex(/^\d{4,8}$/),
  }),
  invoices: z
    .array(
      z.object({
        id: z.string().trim().min(3).max(100),
        code: z.string().trim().min(3).max(60),
        description: z.string().trim().min(2).max(180),
        period: z.string().trim().max(80).optional().default(""),
        amount: z.number().int().positive(),
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("AOA"),
        due_date: z.string().date(),
        status: z.enum(["open", "overdue", "paid", "cancelled"]).default("open"),
      }),
    )
    .max(100),
  bank_accounts: z.array(schoolBankAccountSchema).max(5).optional().default([]),
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  if (!isIntegrationAuthorized(request)) {
    return jsonResponse(
      { error: { code: "unauthorized", message: "Chave de integração inválida." } },
      { status: 401 },
    );
  }

  try {
    const parsed = syncSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "invalid_education_data",
            message: "Confira os identificadores e dados académicos enviados.",
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const now = new Date().toISOString();
    const pinHash = await hashPaymentPin(parsed.data.student.payment_pin);

    await db
      .insert(schools)
      .values({
        id: parsed.data.school.id,
        tenantId: parsed.data.school.tenant_id,
        publicCode: parsed.data.school.code,
        name: parsed.data.school.name,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schools.id,
        set: {
          tenantId: parsed.data.school.tenant_id,
          publicCode: parsed.data.school.code,
          name: parsed.data.school.name,
          status: "active",
          updatedAt: now,
        },
      });

    await db
      .insert(students)
      .values({
        id: parsed.data.student.id,
        schoolId: parsed.data.school.id,
        studentCode: parsed.data.student.code,
        enrollmentId: parsed.data.student.enrollment_id,
        academicYearId: parsed.data.student.academic_year_id,
        classId: parsed.data.student.class_id,
        guardianId: parsed.data.student.guardian_id,
        fullName: parsed.data.student.full_name,
        className: parsed.data.student.class_name,
        financialResponsibleName: parsed.data.student.financial_responsible?.name ?? "",
        financialResponsibleEmail: parsed.data.student.financial_responsible?.email ?? "",
        financialResponsiblePhone: parsed.data.student.financial_responsible?.phone ?? "",
        enrollmentStatus: parsed.data.student.enrollment_status,
        paymentPinHash: pinHash,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: students.id,
        set: {
          schoolId: parsed.data.school.id,
          studentCode: parsed.data.student.code,
          enrollmentId: parsed.data.student.enrollment_id,
          academicYearId: parsed.data.student.academic_year_id,
          classId: parsed.data.student.class_id,
          guardianId: parsed.data.student.guardian_id,
          fullName: parsed.data.student.full_name,
          className: parsed.data.student.class_name,
          financialResponsibleName: parsed.data.student.financial_responsible?.name ?? "",
          financialResponsibleEmail: parsed.data.student.financial_responsible?.email ?? "",
          financialResponsiblePhone: parsed.data.student.financial_responsible?.phone ?? "",
          enrollmentStatus: parsed.data.student.enrollment_status,
          paymentPinHash: pinHash,
          status: "active",
          updatedAt: now,
        },
      });

    for (const account of parsed.data.bank_accounts) {
      const iban = validateAngolaIban(account.iban);
      if (!iban.ok) continue;
      if (account.is_primary) {
        await db
          .update(bankAccounts)
          .set({ isPrimary: false, updatedAt: now })
          .where(
            and(
              eq(bankAccounts.scope, "school"),
              eq(bankAccounts.schoolId, parsed.data.school.id),
              eq(bankAccounts.currency, account.currency),
              ne(bankAccounts.id, account.id),
            ),
          );
      }
      await db
        .insert(bankAccounts)
        .values({
          id: account.id,
          scope: "school",
          schoolId: parsed.data.school.id,
          accountHolder: account.account_holder,
          bankName: account.bank_name,
          iban: iban.compact,
          currency: account.currency,
          status: account.status,
          isPrimary: account.is_primary,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: bankAccounts.id,
          set: {
            scope: "school",
            schoolId: parsed.data.school.id,
            accountHolder: account.account_holder,
            bankName: account.bank_name,
            iban: iban.compact,
            currency: account.currency,
            status: account.status,
            isPrimary: account.is_primary,
            updatedAt: now,
          },
        });
    }

    for (const invoice of parsed.data.invoices) {
      await db
        .insert(studentInvoices)
        .values({
          id: invoice.id,
          schoolId: parsed.data.school.id,
          studentId: parsed.data.student.id,
          invoiceCode: invoice.code,
          description: invoice.description,
          period: invoice.period,
          amountMinor: invoice.amount,
          currency: invoice.currency,
          dueDate: invoice.due_date,
          status: invoice.status,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: studentInvoices.id,
          set: {
            invoiceCode: invoice.code,
            description: invoice.description,
            period: invoice.period,
            amountMinor: invoice.amount,
            currency: invoice.currency,
            dueDate: invoice.due_date,
            status: invoice.status,
            updatedAt: now,
          },
        });
    }

    return jsonResponse({
      data: {
        school_id: parsed.data.school.id,
        student_id: parsed.data.student.id,
        student_code: parsed.data.student.code,
        enrollment_id: parsed.data.student.enrollment_id,
        academic_year_id: parsed.data.student.academic_year_id,
        class_id: parsed.data.student.class_id,
        guardian_id: parsed.data.student.guardian_id,
        enrollment_status: parsed.data.student.enrollment_status,
        invoices_received: parsed.data.invoices.length,
        bank_accounts_received: parsed.data.bank_accounts.length,
        synced_at: now,
      },
    });
  } catch (error) {
    console.error("education_sync_failed", error);
    return jsonResponse(
      { error: { code: "sync_failed", message: "Não foi possível sincronizar os dados académicos." } },
      { status: 500 },
    );
  }
}
