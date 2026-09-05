import { createFileRoute } from "@tanstack/react-router";
import {
  applyPayflowSettlement,
  payflowSettlementAuthorized,
  payflowSettlementInputSchema,
} from "@/features/finance/payflow-settlement";
import { PayflowBrandIcon } from "@/features/finance/components/PayflowBrandIcon";

// style-check: route-exempt — webhook HTTP PayFlow → SIGA (sem shell administrativo).

export const Route = createFileRoute("/api/finance/payflow/settlement")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!payflowSettlementAuthorized(request.headers.get("authorization"))) {
          return Response.json(
            { ok: false, message: "Chave de integração PayFlow inválida." },
            { status: 401 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, message: "Corpo JSON inválido." }, { status: 400 });
        }

        const parsed = payflowSettlementInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              ok: false,
              message: "Pedido inválido.",
              issues: parsed.error.flatten().fieldErrors,
            },
            { status: 400 },
          );
        }

        try {
          const result = await applyPayflowSettlement(parsed.data);
          return Response.json(
            {
              ok: result.ok,
              message: result.message,
              idempotent: "idempotent" in result ? result.idempotent : undefined,
              receiptNumber: "receiptNumber" in result ? result.receiptNumber : undefined,
            },
            { status: result.status },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao aplicar o acerto PayFlow.";
          return Response.json({ ok: false, message }, { status: 502 });
        }
      },
    },
  },
  component: PayflowSettlementPlaceholder,
});

function PayflowSettlementPlaceholder() {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <div className="mb-4 flex justify-center">
        <PayflowBrandIcon size={48} className="rounded-xl shadow-sm" />
      </div>
      <h1 className="font-display text-lg font-extrabold">Acerto PayFlow</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O PayFlow envia <span className="font-mono text-xs">POST</span> autenticado quando um
        pagamento é liquidado ou estornado, para o caixa do SIGA ficar alinhado.
      </p>
    </main>
  );
}
