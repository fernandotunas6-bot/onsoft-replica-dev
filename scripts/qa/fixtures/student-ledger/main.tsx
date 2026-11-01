import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from "@tanstack/react-router";
import { StudentLedgerPanel } from "@/features/finance/components/StudentLedgerPanel";
import "@/styles.css";
import { PaymentReferenceCard } from "@/features/finance/components/PaymentReferenceCard";
export function Demo() {
  return (
    <main className="mx-auto max-w-6xl p-3 sm:p-6">
      <p className="mb-4 text-sm text-muted-foreground">
        Ensaio visual controlado · dados fictícios · sem ligação a serviços externos
      </p>
      <StudentLedgerPanel blocked={false} />
    </main>
  );
}
const rootRoute = createRootRoute({ component: Outlet });
const home = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Demo });
const invoices = createRoute({
  getParentRoute: () => rootRoute,
  path: "/faturas",
  component: () => <p id="navigation-result">Destino de ensaio: {location.search}</p>,
});
const payment = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pagamento",
  component: () => (
    <main className="mx-auto max-w-6xl p-3 sm:p-6">
      <p className="mb-4 text-sm">Ensaio controlado · dados fictícios · sem pagamentos reais</p>
      <PaymentReferenceCard invoiceId="invoice-demo" invoiceNumber="FT-ENSAIO" />
    </main>
  ),
});
const router = createRouter({ routeTree: rootRoute.addChildren([home, invoices, payment]) });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
