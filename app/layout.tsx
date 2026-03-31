import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "AgentForge — AI Agent Marketplace on Stellar",
  description:
    "Build, monetize, and deploy AI agents on the Stellar blockchain. Pay per request with 0x402 protocol.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased bg-[#050508] text-white">
        <Navbar />
        <main className="pt-16">
          <AppShell>{children}</AppShell>
        </main>
      </body>
    </html>
  );
}
