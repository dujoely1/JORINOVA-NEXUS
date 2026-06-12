import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthProvider";
import { I18nProvider } from "./contexts/I18nProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JORINOVA NEXUS · ALIS-X",
  description: "Offline-first hybrid AI laboratory information system",
  icons: { icon: "/next.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <AuthProvider>
        <I18nProvider>
          <body className="min-h-full flex flex-col">{children}</body>
        </I18nProvider>
      </AuthProvider>
    </html>
  );
}
