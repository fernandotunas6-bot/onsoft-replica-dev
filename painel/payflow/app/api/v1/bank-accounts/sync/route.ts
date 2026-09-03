import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { bankAccounts, schools } from "@/db/schema";
import { maskIban, validateAngolaIban } from "@/lib/angola-banking";
import { corsHeaders, isIntegrationAuthorized, jsonResponse } from "@/lib/payflow";

export const dynamic = "force-dynamic";

const accountSchema = z
  .object({
    id: z.string().trim().min(3).max(100),
    scope: z.enum(["platform", "school"]),
    school_id: z.string().trim().min(3).max(100).nullable().optional(),
    account_holder: z.string().trim().min(2).max(160),
    bank_name: z.string().trim().min(2).max(120),
    iban: z.string().trim().min(8).max(40),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("AOA"),
    status: z.enum(["active", "inactive"]).default("active"),
    is_primary: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.scope === "school" && !value.school_id) {
      context.addIssue({ code: "custom", path: ["school_id"], message: "A escola é obrigatória." });
    }
    if (value.scope === "platform" && value.school_id) {
      context.addIssue({ code: "custom", path: ["school_id"], message: "A conta da plataforma não pertence a uma escola." });
    }
    const iban = validateAngolaIban(value.iban);
    if (!iban.ok) {
      context.addIssue({ code: "custom", path: ["iban"], message: iban.error });
    }
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
    const parsed = accountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(
        {
          error: {
            code: "invalid_bank_account",
            message: "Confira os dados da conta bancária.",
            fields: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const validatedIban = validateAngolaIban(parsed.data.iban);
    if (!validatedIban.ok) {
      return jsonResponse(
        { error: { code: "invalid_iban", message: validatedIban.error } },
        { status: 400 },
      );
    }

    const db = getDb();
    if (parsed.data.scope === "school") {
      const [school] = await db
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, parsed.data.school_id!))
        .limit(1);
      if (!school) {
        return jsonResponse(
          { error: { code: "school_not_found", message: "Sincronize a escola antes da conta bancária." } },
          { status: 409 },
        );
      }
    }

    const now = new Date().toISOString();
    if (parsed.data.is_primary) {
      const ownership = parsed.data.scope === "school"
        ? eq(bankAccounts.schoolId, parsed.data.school_id!)
        : eq(bankAccounts.scope, "platform");
      await db
        .update(bankAccounts)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            ownership,
            eq(bankAccounts.scope, parsed.data.scope),
            eq(bankAccounts.currency, parsed.data.currency),
            ne(bankAccounts.id, parsed.data.id),
          ),
        );
    }

    await db
      .insert(bankAccounts)
      .values({
        id: parsed.data.id,
        scope: parsed.data.scope,
        schoolId: parsed.data.scope === "school" ? parsed.data.school_id! : null,
        accountHolder: parsed.data.account_holder,
        bankName: parsed.data.bank_name,
        iban: validatedIban.compact,
        currency: parsed.data.currency,
        status: parsed.data.status,
        isPrimary: parsed.data.is_primary,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: bankAccounts.id,
        set: {
          scope: parsed.data.scope,
          schoolId: parsed.data.scope === "school" ? parsed.data.school_id! : null,
          accountHolder: parsed.data.account_holder,
          bankName: parsed.data.bank_name,
          iban: validatedIban.compact,
          currency: parsed.data.currency,
          status: parsed.data.status,
          isPrimary: parsed.data.is_primary,
          updatedAt: now,
        },
      });

    return jsonResponse({
      data: {
        id: parsed.data.id,
        scope: parsed.data.scope,
        school_id: parsed.data.scope === "school" ? parsed.data.school_id : null,
        iban: maskIban(validatedIban.compact),
        status: parsed.data.status,
        is_primary: parsed.data.is_primary,
        synced_at: now,
      },
    });
  } catch (error) {
    console.error("bank_account_sync_failed", error);
    return jsonResponse(
      { error: { code: "bank_account_sync_failed", message: "Não foi possível sincronizar a conta bancária." } },
      { status: 500 },
    );
  }
}
