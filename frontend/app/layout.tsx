import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthProvider";
import { I18nProvider } from "./contexts/I18nProvider";

// NOTE: fonts use a system stack defined in globals.css (--font-geist-sans /
// --font-geist-mono) instead of next/font/google. This keeps the app fully
// OFFLINE-FIRST — the build no longer fetches from fonts.googleapis.com, so it
// works on an air-gapped hospital VM and in restricted CI networks.

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
    <html lang="en" className="h-full antialiased">
      <AuthProvider>
        <I18nProvider>
          <body className="min-h-full flex flex-col">{children}</body>
        </I18nProvider>
      </AuthProvider>
    </html>
  );
}
