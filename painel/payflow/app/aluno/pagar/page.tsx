import type { Metadata } from "next";

import { StudentPaymentPortal } from "./student-payment-portal";

export const metadata: Metadata = {
  title: "Portal financeiro — PayFlow",
  description: "Consulte cobranças, faça pagamentos e aceda aos seus recibos escolares.",
};

export default function StudentPaymentPage() {
  return <StudentPaymentPortal />;
}
