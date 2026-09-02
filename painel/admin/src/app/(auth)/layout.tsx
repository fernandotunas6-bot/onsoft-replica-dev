import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Autenticação — SIGA Plus",
  description: "Entre na sua conta de administrador da plataforma SIGA Plus.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
