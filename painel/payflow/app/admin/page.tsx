import type { Metadata } from "next";

import { PayflowAdminDashboard } from "./payflow-admin-dashboard";

export const metadata: Metadata = {
  title: "Painel Administrativo — PayFlow",
  description: "Gestão financeira, conciliação e conferência de pagamentos escolares do ecossistema SIGA Plus.",
};

export default function AdminPage() {
  return <PayflowAdminDashboard />;
}
