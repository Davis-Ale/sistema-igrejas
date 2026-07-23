import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  applicationName: "Eventos",
  title: {
    default: "Eventos",
    template: "%s | Eventos"
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg"
  },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({
  children
}: RootLayoutProps) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
