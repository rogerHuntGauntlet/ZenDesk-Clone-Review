import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SupabaseProvider } from './providers';
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "OHFdesk",
  description: "OHF does Zendesk",
  icons: {
    icon: '/icon.svg'
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <SupabaseProvider>
          {children}
        </SupabaseProvider>
        <Toaster />
      </body>
    </html>
  );
}
