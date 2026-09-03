import { AdminApp } from "./AdminApp";
import { App as CheckoutApp } from "./CheckoutApp";
import { PortalApp } from "./PortalApp";

export function App() {
  const path = window.location.pathname;
  if (/^\/checkout\/[^/]+\/?$/.test(path)) return <CheckoutApp />;
  if (/^\/portal\/[^/]+\/?$/.test(path)) return <PortalApp />;
  return <AdminApp />;
}
