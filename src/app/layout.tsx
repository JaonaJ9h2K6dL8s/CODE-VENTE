import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ThemeRegistry from "./ThemeRegistry";
import ServerStatus from "@/components/ServerStatus";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Vente en ligne - Gestion des commandes",
  description: "Application de gestion des ventes en ligne",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <ThemeRegistry>
          {children}
          <ServerStatus />
        </ThemeRegistry>
      </body>
    </html>
  );
}
