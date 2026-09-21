import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Organizador | Eventos",
  description: "Recepção e check-in dos participantes do evento.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
