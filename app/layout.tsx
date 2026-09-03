import type { Metadata, Viewport } from "next";
import { DM_Mono, Sora } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "PersonalHub - Your Digital Sanctuary",
  description: "Personal hub for notes, music, photos, and letters",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PersonalHub",
  },
};

export const viewport: Viewport = {
  themeColor: "#090707",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${dmMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="PersonalHub" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
