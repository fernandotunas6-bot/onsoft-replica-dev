import type { Metadata } from "next";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { LanguageProvider } from "@/contexts/language-context";
import { inter } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "SIGA Plus — Centro de controlo SaaS",
  description: "Centro de controlo SaaS da plataforma SIGA Plus.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt" className={`${inter.variable} antialiased`} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider defaultTheme="light" storageKey="nextjs-ui-theme">
          <LanguageProvider>
            <SidebarConfigProvider>
              {children}
            </SidebarConfigProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
