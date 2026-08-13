import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const functional = Inter({
  subsets: ["latin"],
  variable: "--font-functional",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Puleiro do GRU",
  description: "O lugar onde os mascotes do GRU nascem.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preload" as="image" href="/assets/puleiro-preparing-canonical.jpg" />
        <link rel="preload" as="image" href="/assets/puleiro-reveal.jpg" />
      </head>
      <body className={`${display.variable} ${functional.variable}`}>{children}</body>
    </html>
  );
}
