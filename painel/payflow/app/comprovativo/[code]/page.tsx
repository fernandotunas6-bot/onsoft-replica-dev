import type { Metadata } from "next";

import { ReceiptVerification } from "./receipt-verification";

export const metadata: Metadata = {
  title: "Validar recibo — PayFlow",
  description: "Consulta pública de recibos de pagamentos escolares e assinaturas.",
};

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ReceiptVerification code={code} />;
}
