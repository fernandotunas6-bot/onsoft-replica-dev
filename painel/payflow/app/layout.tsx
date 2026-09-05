import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayFlow — Financeiro Escolar do SIGA Plus",
  description:
    "Cobranças, pagamentos, recibos e conciliação escolar profundamente integrados ao SIGA Plus.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
    ],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-AO">
      <body className="antialiased">{children}</body>
    </html>
  );
}
