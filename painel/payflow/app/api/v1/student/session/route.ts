import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  schools,
  bankAccounts,
  studentAccessLimits,
  studentInvoices,
  studentPaymentSessions,
  students,
} from "@/db/schema";
import {
  createOpaqueId,
  hashPaymentPin,
  isStudentCode,
  sha256,
  verifyPaymentPin,
} from "@/lib/identifiers";
import { corsHeaders, jsonResponse } from "@/lib/payflow";
import { getPublicRuntimeStatus } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const lookupSchema = z.object({
  school_code: z.string().trim().toUpperCase().min(3).max(30),
  student_code: z.string().trim(),
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

const ACCESS_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
// O limite acima é por aluno e IP: rodando endereços, um PIN de 4 dígitos
// (10 000 combinações) adivinhava-se. Este conta por aluno, qualquer IP.
const ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_MAX_FAILED_ATTEMPTS = 30;
const ACCOUNT_LOCK_MS = 60 * 60 * 1000;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const parsed = lookupSchema.safeParse(await request.json());
    if (!parsed.success || !isStudentCode(parsed.data.student_code)) {
      return jsonResponse(
        { error: { code: "invalid_student_access", message: "Informe o código da escola, o ID de 7 dígitos e o PIN." } },
        { status: 400 },
      );
    }

    const db = getDb();
    const requestTime = new Date();
    const clientHint = (
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0] ??
      "unknown"
    )
      .trim()
      .slice(0, 128);
    const accessKeyHash = await sha256(
      `${parsed.data.school_code}:${parsed.data.student_code}:${clientHint}`,
    );

    await db
      .delete(studentAccessLimits)
      .where(lt(studentAccessLimits.updatedAt, new Date(requestTime.getTime() - 24 * 60 * 60 * 1000).toISOString()));

    const [accessLimit] = await db
      .select()
      .from(studentAccessLimits)
      .where(eq(studentAccessLimits.keyHash, accessKeyHash))
      .limit(1);

    const accountKeyHash = await sha256(
      `acct:${parsed.data.school_code}:${parsed.data.student_code}`,
    );
    const [accountLimit] = await db
      .select()
      .from(studentAccessLimits)
      .where(eq(studentAccessLimits.keyHash, accountKeyHash))
      .limit(1);

    const activeLock = [accessLimit?.lockedUntil, accountLimit?.lockedUntil]
      .map((value) => (value ? Date.parse(value) : 0))
      .reduce((latest, value) => Math.max(latest, value), 0);
    if (activeLock > requestTime.getTime()) {
      const retryAfter = Math.max(1, Math.ceil((activeLock - requestTime.getTime()) / 1000));
      return jsonResponse(
        { error: { code: "student_access_limited", message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." } },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    let school: { id: string; tenantId: string; publicCode: string; name: string } | null = null;
    let student: { id: string; studentCode: string; fullName: string; className: string } | null = null;
    let invoices: Array<{
      id: string;
      invoiceCode: string;
      description: string;
      period: string;
      amountMinor: number;
      currency: string;
      dueDate: string;
      status: string;
    }> = [];
    let bankTransferAvailable = false;

    const [storedSchool] = await db
      .select({
        id: schools.id,
        tenantId: schools.tenantId,
        publicCode: schools.publicCode,
        name: schools.name,
      })
      .from(schools)
      .where(and(eq(schools.publicCode, parsed.data.school_code), eq(schools.status, "active")))
      .limit(1);

    if (storedSchool) {
      const [storedStudent] = await db
        .select()
        .from(students)
        .where(
          and(
            eq(students.schoolId, storedSchool.id),
            eq(students.studentCode, parsed.data.student_code),
            eq(students.status, "active"),
          ),
        )
        .limit(1);
      const pinVerified = storedStudent
        ? await verifyPaymentPin(parsed.data.pin, storedStudent.paymentPinHash)
        : false;
      if (storedStudent && pinVerified) {
        school = storedSchool;
        student = {
          id: storedStudent.id,
          studentCode: storedStudent.studentCode,
          fullName: storedStudent.fullName,
          className: storedStudent.className,
        };
        invoices = await db
          .select({
            id: studentInvoices.id,
            invoiceCode: studentInvoices.invoiceCode,
            description: studentInvoices.description,
            period: studentInvoices.period,
            amountMinor: studentInvoices.amountMinor,
            currency: studentInvoices.currency,
            dueDate: studentInvoices.dueDate,
            status: studentInvoices.status,
          })
          .from(studentInvoices)
          .where(
            and(
              eq(studentInvoices.studentId, storedStudent.id),
              inArray(studentInvoices.status, ["open", "overdue"]),
            ),
          );

        const [bankAccount] = await db
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(
            and(
              eq(bankAccounts.scope, "school"),
              eq(bankAccounts.schoolId, storedSchool.id),
              eq(bankAccounts.status, "active"),
            ),
          )
          .orderBy(desc(bankAccounts.isPrimary), desc(bankAccounts.updatedAt))
          .limit(1);
        bankTransferAvailable = Boolean(bankAccount);

        if (!storedStudent.paymentPinHash.startsWith("pbkdf2_sha256$")) {
          await db
            .update(students)
            .set({ paymentPinHash: await hashPaymentPin(parsed.data.pin), updatedAt: requestTime.toISOString() })
            .where(eq(students.id, storedStudent.id));
        }
      }
    }

    if (!school || !student) {
      const previousWindowStart = accessLimit ? Date.parse(accessLimit.windowStartedAt) : Number.NaN;
      const insideCurrentWindow =
        Number.isFinite(previousWindowStart) &&
        requestTime.getTime() - previousWindowStart < ACCESS_WINDOW_MS;
      const failedAttempts = insideCurrentWindow ? (accessLimit?.failedAttempts ?? 0) + 1 : 1;
      const lockedUntil =
        failedAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(requestTime.getTime() + ACCESS_WINDOW_MS).toISOString()
          : null;

      await db
        .insert(studentAccessLimits)
        .values({
          keyHash: accessKeyHash,
          failedAttempts,
          windowStartedAt: insideCurrentWindow && accessLimit
            ? accessLimit.windowStartedAt
            : requestTime.toISOString(),
          lockedUntil,
          updatedAt: requestTime.toISOString(),
        })
        .onConflictDoUpdate({
          target: studentAccessLimits.keyHash,
          set: {
            failedAttempts,
            windowStartedAt: insideCurrentWindow && accessLimit
              ? accessLimit.windowStartedAt
              : requestTime.toISOString(),
            lockedUntil,
            updatedAt: requestTime.toISOString(),
          },
        });

      const accountWindowStart = accountLimit ? Date.parse(accountLimit.windowStartedAt) : Number.NaN;
      const insideAccountWindow =
        Number.isFinite(accountWindowStart) &&
        requestTime.getTime() - accountWindowStart < ACCOUNT_WINDOW_MS;
      const accountFailures = insideAccountWindow ? (accountLimit?.failedAttempts ?? 0) + 1 : 1;
      const accountWindowStartedAt =
        insideAccountWindow && accountLimit ? accountLimit.windowStartedAt : requestTime.toISOString();
      const accountLockedUntil =
        accountFailures >= ACCOUNT_MAX_FAILED_ATTEMPTS
          ? new Date(requestTime.getTime() + ACCOUNT_LOCK_MS).toISOString()
          : null;
      await db
        .insert(studentAccessLimits)
        .values({
          keyHash: accountKeyHash,
          failedAttempts: accountFailures,
          windowStartedAt: accountWindowStartedAt,
          lockedUntil: accountLockedUntil,
          updatedAt: requestTime.toISOString(),
        })
        .onConflictDoUpdate({
          target: studentAccessLimits.keyHash,
          set: {
            failedAttempts: accountFailures,
            windowStartedAt: accountWindowStartedAt,
            lockedUntil: accountLockedUntil,
            updatedAt: requestTime.toISOString(),
          },
        });

      if (lockedUntil || accountLockedUntil) {
        return jsonResponse(
          { error: { code: "student_access_limited", message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." } },
          { status: 429, headers: { "Retry-After": String(ACCESS_WINDOW_MS / 1000) } },
        );
      }

      return jsonResponse(
        { error: { code: "student_not_verified", message: "Dados não encontrados ou PIN inválido." } },
        { status: 404 },
      );
    }

    if (accessLimit) {
      await db.delete(studentAccessLimits).where(eq(studentAccessLimits.keyHash, accessKeyHash));
    }
    if (accountLimit) {
      await db.delete(studentAccessLimits).where(eq(studentAccessLimits.keyHash, accountKeyHash));
    }

    const sessionToken = createOpaqueId("stu_session", 32);
    const tokenHash = await sha256(sessionToken);
    const createdAt = requestTime;
    const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString();
    await db.insert(studentPaymentSessions).values({
      tokenHash,
      schoolId: school.id,
      studentId: student.id,
      expiresAt,
      createdAt: createdAt.toISOString(),
    });

    const runtime = getPublicRuntimeStatus();
    const paymentMethods = [
      ...(runtime.sandboxEnabled ? ["mcx_express", "payment_reference"] : []),
      ...(bankTransferAvailable ? ["bank_transfer"] : []),
    ];
    return jsonResponse({
      data: {
        session_token: sessionToken,
        expires_at: expiresAt,
        sandbox: runtime.sandboxEnabled,
        payments_enabled: paymentMethods.length > 0,
        payment_methods: paymentMethods,
        school: {
          id: school.id,
          tenant_id: school.tenantId,
          code: school.publicCode,
          name: school.name,
        },
        student: {
          id: student.id,
          student_code: student.studentCode,
          full_name: student.fullName,
          class_name: student.className,
        },
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          code: invoice.invoiceCode,
          description: invoice.description,
          period: invoice.period,
          amount: invoice.amountMinor,
          currency: invoice.currency,
          due_date: invoice.dueDate,
          status: invoice.status,
        })),
      },
    });
  } catch (error) {
    console.error("student_session_failed", error);
    return jsonResponse(
      { error: { code: "student_lookup_failed", message: "Não foi possível consultar os dados neste momento." } },
      { status: 500 },
    );
  }
}
