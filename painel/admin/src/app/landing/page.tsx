import type { Metadata } from "next";
import { LandingPageContent } from "./landing-page-content";

// /landing é só uma ponte para o portal comercial (WEB): AliveBridgeGate redirecciona.
// Os metadados do modelo («Modern Admin Dashboard Template») ficavam no HTML exportado.
export const metadata: Metadata = {
  title: "SIGA Plus — Portal comercial",
  description: "Gestão escolar para Angola. O portal comercial do SIGA Plus abre a seguir.",
  robots: { index: false, follow: false },
};

export default function LandingPage() {
  return <LandingPageContent />;
}
